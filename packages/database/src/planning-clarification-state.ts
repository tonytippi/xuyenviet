import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { ValidatedPlanningContext } from "@xuyenviet/contracts";

import { getDb } from "./client";
import { comparePlanningScopes, evaluateEffectivePlanningValue, evaluatePlanningCompleteness, planningContextCatalog, resolvePlanningContext, type ScopedPlanningValue, validatePlanningScopeGraph, validatePlanningValues } from "./planning-context-profiles";
import { aiAskCommands, conversations, messages, planningClarificationAssumptions, planningClarificationAttempts, planningClarificationClaims, planningClarificationFieldStates, planningClarificationInstances, planningClarificationSessions, planningClarificationValues, tripChangeProposals, tripProjects } from "./schema";

type State = "collecting" | "ready" | "claimed" | "completed" | "abandoned";
export type ClarificationEvidence = { key: string; value: string; scopeId: string; schemaVersion: string; precedence: "nearest_ancestor" | "explicit_compatible"; startOffset: number; endOffset: number; digest: string };
export type ClarificationReduction = { userId: string; sessionId: string; sourceMessageId: string; expectedSessionRevision: number; expectedContentRevision: number; extractionAttemptId: string; values: readonly ClarificationEvidence[] };
export type ClarificationAssumption = { instanceId: string; key: string; value: string; scopeId: string; schemaVersion: string; disclosed: boolean };

export function validateClarificationEvidence(content: string, evidence: ClarificationEvidence): boolean {
  return Number.isInteger(evidence.startOffset) && Number.isInteger(evidence.endOffset) && evidence.startOffset >= 0 && evidence.endOffset > evidence.startOffset && evidence.endOffset <= content.length && content.slice(evidence.startOffset, evidence.endOffset) === evidence.value && createHash("sha256").update(evidence.value).digest("hex") === evidence.digest;
}

export function reduceClarificationValues(context: ValidatedPlanningContext, existing: readonly ScopedPlanningValue[], additions: readonly Pick<ClarificationEvidence, "key" | "value" | "scopeId" | "schemaVersion" | "precedence">[]) {
  const merged = [...existing];
  for (const value of additions) if (!merged.some((current) => current.key === value.key && current.value === value.value && current.scopeId === value.scopeId && current.schemaVersion === value.schemaVersion)) merged.push(value);
  return validatePlanningValues(planningContextCatalog.profiles[context.deliverables[0]!.kind], context.scopes, merged);
}

export async function initializeClarificationSession(input: { userId: string; conversationId: string; tripProjectId?: string | null; proposalId?: string | null; proposalVersion?: number | null; planAttemptId: string; context: ValidatedPlanningContext }) {
  return getDb().transaction(async (transaction) => {
    if (!validatedContext(input.context)) return null;
    const [conversation] = await transaction.select().from(conversations).where(and(eq(conversations.id, input.conversationId), eq(conversations.userId, input.userId))).limit(1).for("update");
    const [attempt] = await transaction.select().from(planningClarificationAttempts).where(and(eq(planningClarificationAttempts.id, input.planAttemptId), eq(planningClarificationAttempts.userId, input.userId), eq(planningClarificationAttempts.kind, "plan"))).limit(1);
    const [command] = attempt ? await transaction.select().from(aiAskCommands).where(and(eq(aiAskCommands.id, attempt.commandId), eq(aiAskCommands.userId, input.userId))).limit(1).for("update") : [];
    if (!conversation || !attempt || !command || command.status !== "pending" || command.conversationId !== conversation.id || command.tripProjectId !== (input.tripProjectId ?? null) || command.userMessageId !== attempt.sourceMessageId || command.conversationLifecycleVersion !== conversation.lifecycleVersion || attempt.expectedSessionRevision !== 0 || attempt.sourceMessageId === null || !input.context.deliverables.length || !attemptMatchesContext(attempt, input.context)) return null;
    if (input.tripProjectId) {
      const [project] = await transaction.select({ id: tripProjects.id, aggregateVersion: tripProjects.aggregateVersion }).from(tripProjects).where(and(eq(tripProjects.id, input.tripProjectId), eq(tripProjects.userId, input.userId))).limit(1);
      if (!project || command.tripProjectId !== project.id || command.tripProjectAggregateVersion !== project.aggregateVersion || conversation.tripProjectId !== project.id) return null;
    }
    const [proposal] = input.proposalId ? await transaction.select({ id: tripChangeProposals.id, version: tripChangeProposals.version, status: tripChangeProposals.status }).from(tripChangeProposals).where(and(eq(tripChangeProposals.id, input.proposalId), eq(tripChangeProposals.userId, input.userId), eq(tripChangeProposals.tripProjectId, input.tripProjectId ?? ""))).limit(1).for("update") : [];
    if (!proposalPinMatches(input.proposalId ?? null, input.proposalVersion ?? null, proposal)) return null;
    const [sourceMessage] = await transaction.select({ conversationId: messages.conversationId, ordinal: messages.ordinal }).from(messages).where(and(eq(messages.id, attempt.sourceMessageId), eq(messages.userId, input.userId))).limit(1);
    if (!sourceMessage || sourceMessage.conversationId !== conversation.id || sourceMessage.ordinal !== conversation.contentRevision) return null;
    const [active] = await transaction.select().from(planningClarificationSessions).where(and(eq(planningClarificationSessions.conversationId, input.conversationId), eq(planningClarificationSessions.state, "active"))).limit(1).for("update");
    if (active) return active.planAttemptId === input.planAttemptId ? active : null;
    const [session] = await transaction.insert(planningClarificationSessions).values({ userId: input.userId, conversationId: input.conversationId, tripProjectId: input.tripProjectId ?? null, proposalId: input.proposalId ?? null, proposalVersion: input.proposalVersion ?? null, commandId: command.id, conversationLifecycleVersion: conversation.lifecycleVersion, tripProjectAggregateVersion: command.tripProjectAggregateVersion, contentRevision: conversation.contentRevision, graphDigest: input.context.graphDigest, planAttemptId: input.planAttemptId, profileVersion: input.context.versions.profileVersion, policyVersion: input.context.versions.policyVersion, comparatorVersion: input.context.versions.comparatorVersion, scopeGraph: input.context.scopes as unknown[] }).returning();
    await transaction.insert(planningClarificationInstances).values(input.context.deliverables.map((item) => ({ sessionId: session!.id, deliverableId: item.id, kind: item.kind, scopeId: item.scopeId, profile: item.profile as unknown as Record<string, unknown> })));
    const instances = await transaction.select().from(planningClarificationInstances).where(eq(planningClarificationInstances.sessionId, session!.id));
    await writeFieldStates(transaction, session!.id, input.context.scopes, instances, []);
    return session!;
  });
}

export async function evolveClarificationPlan(input: { userId: string; sessionId: string; planAttemptId: string; expectedSessionRevision: number; expectedContentRevision: number; context: ValidatedPlanningContext }) {
  return getDb().transaction(async (transaction) => {
    if (!validatedContext(input.context)) return null;
    const [current] = await transaction.select().from(planningClarificationSessions).where(and(eq(planningClarificationSessions.id, input.sessionId), eq(planningClarificationSessions.userId, input.userId))).limit(1).for("update");
    const [attempt] = await transaction.select().from(planningClarificationAttempts).where(and(eq(planningClarificationAttempts.id, input.planAttemptId), eq(planningClarificationAttempts.userId, input.userId), eq(planningClarificationAttempts.kind, "plan"))).limit(1);
    const [conversation] = current ? await transaction.select().from(conversations).where(and(eq(conversations.id, current.conversationId), eq(conversations.userId, input.userId))).limit(1).for("update") : [];
    const [command] = attempt ? await transaction.select().from(aiAskCommands).where(and(eq(aiAskCommands.id, attempt.commandId), eq(aiAskCommands.userId, input.userId))).limit(1).for("update") : [];
    const [project] = current?.tripProjectId ? await transaction.select({ aggregateVersion: tripProjects.aggregateVersion }).from(tripProjects).where(and(eq(tripProjects.id, current.tripProjectId), eq(tripProjects.userId, input.userId))).limit(1).for("update") : [];
    const [proposal] = current?.proposalId ? await transaction.select({ id: tripChangeProposals.id, version: tripChangeProposals.version, status: tripChangeProposals.status }).from(tripChangeProposals).where(and(eq(tripChangeProposals.id, current.proposalId), eq(tripChangeProposals.userId, input.userId), eq(tripChangeProposals.tripProjectId, current.tripProjectId!))).limit(1).for("update") : [];
    if (current?.state === "superseded" && attempt) {
      const [replacement] = await transaction.select().from(planningClarificationSessions).where(and(eq(planningClarificationSessions.userId, input.userId), eq(planningClarificationSessions.planAttemptId, input.planAttemptId))).limit(1);
      if (replacement) return replacement;
    }
    if (!current || !conversation || !attempt || !command || !proposalPinMatches(current.proposalId, current.proposalVersion, proposal) || current.state !== "active" || current.revision !== input.expectedSessionRevision || current.contentRevision !== input.expectedContentRevision || conversation.contentRevision !== input.expectedContentRevision || conversation.lifecycleVersion !== current.conversationLifecycleVersion || command.status !== "pending" || command.conversationId !== current.conversationId || command.userMessageId !== attempt.sourceMessageId || command.tripProjectId !== current.tripProjectId || command.conversationLifecycleVersion !== current.conversationLifecycleVersion || command.tripProjectAggregateVersion !== current.tripProjectAggregateVersion || (current.tripProjectId !== null && (!project || project.aggregateVersion !== current.tripProjectAggregateVersion)) || attempt.expectedSessionRevision !== current.revision || !input.context.deliverables.length || !attemptMatchesContext(attempt, input.context)) return null;
    if (current.planAttemptId === input.planAttemptId) return current;
    const [sourceMessage] = await transaction.select({ conversationId: messages.conversationId, ordinal: messages.ordinal }).from(messages).where(and(eq(messages.id, attempt.sourceMessageId), eq(messages.userId, input.userId))).limit(1);
    if (!sourceMessage || sourceMessage.conversationId !== current.conversationId || sourceMessage.ordinal !== conversation.contentRevision) return null;
    const priorInstances = await transaction.select().from(planningClarificationInstances).where(eq(planningClarificationInstances.sessionId, current.id));
    const priorValues = await transaction.select().from(planningClarificationValues).where(eq(planningClarificationValues.sessionId, current.id));
    const priorAssumptions = await transaction.select().from(planningClarificationAssumptions).where(eq(planningClarificationAssumptions.sessionId, current.id));
    const [superseded] = await transaction.update(planningClarificationSessions).set({ state: "superseded", revision: current.revision + 1, updatedAt: new Date() }).where(and(eq(planningClarificationSessions.id, current.id), eq(planningClarificationSessions.state, "active"), eq(planningClarificationSessions.revision, current.revision))).returning();
    if (!superseded) return null;
    const [created] = await transaction.insert(planningClarificationSessions).values({ userId: input.userId, conversationId: current.conversationId, tripProjectId: current.tripProjectId, proposalId: current.proposalId, proposalVersion: current.proposalVersion, commandId: command.id, conversationLifecycleVersion: current.conversationLifecycleVersion, tripProjectAggregateVersion: current.tripProjectAggregateVersion, contentRevision: conversation.contentRevision, graphDigest: input.context.graphDigest, planAttemptId: input.planAttemptId, profileVersion: input.context.versions.profileVersion, policyVersion: input.context.versions.policyVersion, comparatorVersion: input.context.versions.comparatorVersion, scopeGraph: input.context.scopes as unknown[] }).returning();
    await transaction.insert(planningClarificationInstances).values(input.context.deliverables.map((item) => ({ sessionId: created!.id, deliverableId: item.id, kind: item.kind, scopeId: item.scopeId, profile: item.profile as unknown as Record<string, unknown> })));
    const instances = await transaction.select().from(planningClarificationInstances).where(eq(planningClarificationInstances.sessionId, created!.id));
    const compatible = new Map(instances.map((instance) => [`${instance.kind}\u0000${instance.scopeId}`, instance]));
    const priorByInstance = new Map(priorInstances.map((instance) => [instance.id, instance]));
    const copiedValues = priorValues.filter((value) => {
      const scoped = persistedScopedValue(value);
      return scoped !== null && [...compatible.values()].some((instance) => validatePlanningValues(planningContextCatalog.profiles[instance.kind as keyof typeof planningContextCatalog.profiles], input.context.scopes, [scoped]).length === 1);
    });
    if (copiedValues.length) await transaction.insert(planningClarificationValues).values(copiedValues.flatMap(({ id: _id, createdAt: _createdAt, sessionId: _sessionId, precedence, ...value }) => precedence === "nearest_ancestor" || precedence === "explicit_compatible" ? [{ ...value, precedence, sessionId: created!.id }] : []));
    const copiedAssumptions = priorAssumptions.flatMap(({ id: _id, createdAt: _createdAt, sessionId: _sessionId, instanceId, ...assumption }) => {
      const prior = priorByInstance.get(instanceId); const next = prior ? compatible.get(`${prior.kind}\u0000${prior.scopeId}`) : null;
      return next ? [{ ...assumption, sessionId: created!.id, instanceId: next.id }] : [];
    });
    if (copiedAssumptions.length) await transaction.insert(planningClarificationAssumptions).values(copiedAssumptions).onConflictDoNothing();
    const scopedValues = copiedValues.flatMap((value) => { const scoped = persistedScopedValue(value); return scoped ? [scoped] : []; });
    await writeFieldStates(transaction, created!.id, input.context.scopes, instances, scopedValues);
    const copiedAssumptionKeys = new Map<string, Set<string>>();
    for (const assumption of copiedAssumptions) copiedAssumptionKeys.set(assumption.instanceId, new Set([...(copiedAssumptionKeys.get(assumption.instanceId) ?? []), assumption.key]));
    for (const instance of instances) {
      const profile = planningContextCatalog.profiles[instance.kind as keyof typeof planningContextCatalog.profiles]!;
      const completeness = evaluatePlanningCompleteness(profile, input.context.scopes, instance.scopeId, scopedValues);
      const assumptions = copiedAssumptionKeys.get(instance.id) ?? new Set<string>();
      if (completeness.ready && completeness.assumed.every((key) => assumptions.has(key))) await transaction.update(planningClarificationInstances).set({ state: "ready", revision: 2, updatedAt: new Date() }).where(and(eq(planningClarificationInstances.id, instance.id), eq(planningClarificationInstances.revision, instance.revision)));
    }
    return created!;
  });
}

export async function reduceClarificationMessage(input: ClarificationReduction) {
  return getDb().transaction(async (transaction) => {
    const [session] = await transaction.select().from(planningClarificationSessions).where(and(eq(planningClarificationSessions.id, input.sessionId), eq(planningClarificationSessions.userId, input.userId))).limit(1).for("update");
    const [conversation] = session ? await transaction.select({ contentRevision: conversations.contentRevision, lifecycleVersion: conversations.lifecycleVersion }).from(conversations).where(and(eq(conversations.id, session.conversationId), eq(conversations.userId, input.userId))).limit(1).for("update") : [];
    const [message] = await transaction.select().from(messages).where(and(eq(messages.id, input.sourceMessageId), eq(messages.userId, input.userId))).limit(1);
    const [attempt] = await transaction.select().from(planningClarificationAttempts).where(and(eq(planningClarificationAttempts.id, input.extractionAttemptId), eq(planningClarificationAttempts.userId, input.userId), eq(planningClarificationAttempts.kind, "extraction"))).limit(1);
    const [command] = attempt ? await transaction.select().from(aiAskCommands).where(and(eq(aiAskCommands.id, attempt.commandId), eq(aiAskCommands.userId, input.userId))).limit(1).for("update") : [];
    const [project] = session?.tripProjectId ? await transaction.select({ aggregateVersion: tripProjects.aggregateVersion }).from(tripProjects).where(and(eq(tripProjects.id, session.tripProjectId), eq(tripProjects.userId, input.userId))).limit(1).for("update") : [];
    const [proposal] = session?.proposalId ? await transaction.select({ id: tripChangeProposals.id, version: tripChangeProposals.version, status: tripChangeProposals.status }).from(tripChangeProposals).where(and(eq(tripChangeProposals.id, session.proposalId), eq(tripChangeProposals.userId, input.userId), eq(tripChangeProposals.tripProjectId, session.tripProjectId!))).limit(1).for("update") : [];
    if (!session || !conversation || !message || !attempt || !command || !proposalPinMatches(session.proposalId, session.proposalVersion, proposal) || session.state !== "active" || session.revision !== input.expectedSessionRevision || session.contentRevision !== input.expectedContentRevision || conversation.lifecycleVersion !== session.conversationLifecycleVersion || conversation.contentRevision !== message.ordinal || command.status !== "pending" || command.conversationId !== session.conversationId || command.userMessageId !== message.id || command.tripProjectId !== session.tripProjectId || command.conversationLifecycleVersion !== session.conversationLifecycleVersion || command.tripProjectAggregateVersion !== session.tripProjectAggregateVersion || (session.tripProjectId !== null && (!project || project.aggregateVersion !== session.tripProjectAggregateVersion)) || message.conversationId !== session.conversationId || message.ordinal <= session.contentRevision || attempt.sourceMessageId !== message.id || attempt.expectedSessionRevision !== session.revision || !extractionMatchesValues(attempt.payload, input.values) || input.values.some((value) => !validateClarificationEvidence(message.content, value))) return null;
    const scopes = validatePlanningScopeGraph(session.scopeGraph as ValidatedPlanningContext["scopes"]);
    if (!scopes || !pinnedSessionMatchesCatalog(session)) return null;
    const instances = await transaction.select().from(planningClarificationInstances).where(eq(planningClarificationInstances.sessionId, session.id));
    const current = await transaction.select().from(planningClarificationValues).where(eq(planningClarificationValues.sessionId, session.id));
    const additions = input.values.filter((value, index, all) => all.findIndex((candidate) => candidate.key === value.key && candidate.value === value.value && candidate.scopeId === value.scopeId && candidate.schemaVersion === value.schemaVersion && candidate.startOffset === value.startOffset && candidate.endOffset === value.endOffset) === index && !current.some((row) => row.key === value.key && row.value === value.value && row.scopeId === value.scopeId && row.sourceMessageId === message.id && row.startOffset === value.startOffset && row.endOffset === value.endOffset));
    if (!additions.length) return { ...session, replayed: true };
    const profileFor = (instance: typeof instances[number]) => planningContextCatalog.profiles[instance.kind as keyof typeof planningContextCatalog.profiles];
    if (additions.some((value) => !instances.some((instance) => {
      const profile = profileFor(instance);
      return profile && validatePlanningValues(profile, scopes, [value]).length === 1;
    }))) return null;
    await transaction.insert(planningClarificationValues).values(additions.map((value) => ({ sessionId: session.id, ...value, sourceMessageId: message.id, sourceMessageOrdinal: message.ordinal, evidenceDigest: value.digest })));
    const allValues = [...current, ...additions.map((value) => ({ key: value.key, value: value.value, scopeId: value.scopeId, schemaVersion: value.schemaVersion, precedence: value.precedence }))] as ScopedPlanningValue[];
    const changedKeys = new Set(additions.map((item) => item.key));
    const changedScopes = new Set(additions.map((item) => item.scopeId));
    const mutableInstances = instances.filter((instance) => (instance.state === "collecting" || instance.state === "ready") && affectedBy(additions, profileFor(instance), scopes, instance.scopeId));
    for (const instance of mutableInstances) {
      const profile = planningContextCatalog.profiles[instance.kind as keyof typeof planningContextCatalog.profiles];
      if (!profile || !profile.fields.some((field) => changedKeys.has(field.key))) continue;
      const completeness = evaluatePlanningCompleteness(profile, scopes, instance.scopeId, allValues);
      const state: State = completeness.ready && completeness.assumed.length === 0 ? "ready" : "collecting";
      const [changed] = await transaction.update(planningClarificationInstances).set({ state, revision: instance.revision + 1, updatedAt: new Date() }).where(and(eq(planningClarificationInstances.id, instance.id), eq(planningClarificationInstances.revision, instance.revision))).returning({ id: planningClarificationInstances.id });
      if (!changed) throw new Error("Clarification instance CAS failed.");
    }
    await writeFieldStates(transaction, session.id, scopes, mutableInstances, allValues, new Set(), changedKeys);
    const [updated] = await transaction.update(planningClarificationSessions).set({ revision: session.revision + 1, contentRevision: message.ordinal, updatedAt: new Date() }).where(and(eq(planningClarificationSessions.id, session.id), eq(planningClarificationSessions.revision, session.revision))).returning();
    return updated ?? null;
  });
}

export async function persistClarificationAssumptions(input: { userId: string; sessionId: string; expectedSessionRevision: number; expectedContentRevision: number; assumptions: readonly ClarificationAssumption[] }) {
  if (!input.assumptions.length || input.assumptions.some((item) => !item.disclosed || !item.value.trim())) return null;
  return getDb().transaction(async (transaction) => {
    const [session] = await transaction.select().from(planningClarificationSessions).where(and(eq(planningClarificationSessions.id, input.sessionId), eq(planningClarificationSessions.userId, input.userId), eq(planningClarificationSessions.state, "active"), eq(planningClarificationSessions.revision, input.expectedSessionRevision), eq(planningClarificationSessions.contentRevision, input.expectedContentRevision))).limit(1).for("update");
    const [conversation] = session ? await transaction.select({ contentRevision: conversations.contentRevision, lifecycleVersion: conversations.lifecycleVersion }).from(conversations).where(and(eq(conversations.id, session.conversationId), eq(conversations.userId, input.userId))).limit(1).for("update") : [];
    const [command] = session ? await transaction.select().from(aiAskCommands).where(and(eq(aiAskCommands.id, session.commandId), eq(aiAskCommands.userId, input.userId))).limit(1).for("update") : [];
    const [project] = session?.tripProjectId ? await transaction.select({ aggregateVersion: tripProjects.aggregateVersion }).from(tripProjects).where(and(eq(tripProjects.id, session.tripProjectId), eq(tripProjects.userId, input.userId))).limit(1).for("update") : [];
    const [proposal] = session?.proposalId ? await transaction.select({ id: tripChangeProposals.id, version: tripChangeProposals.version, status: tripChangeProposals.status }).from(tripChangeProposals).where(and(eq(tripChangeProposals.id, session.proposalId), eq(tripChangeProposals.userId, input.userId), eq(tripChangeProposals.tripProjectId, session.tripProjectId!))).limit(1).for("update") : [];
    if (!session || !conversation || !command || !proposalPinMatches(session.proposalId, session.proposalVersion, proposal) || !pinnedSessionMatchesCatalog(session) || conversation.contentRevision !== session.contentRevision || conversation.lifecycleVersion !== session.conversationLifecycleVersion || command.status !== "pending" || command.conversationId !== session.conversationId || command.tripProjectId !== session.tripProjectId || command.conversationLifecycleVersion !== session.conversationLifecycleVersion || command.tripProjectAggregateVersion !== session.tripProjectAggregateVersion || (session.tripProjectId !== null && (!project || project.aggregateVersion !== session.tripProjectAggregateVersion))) return null;
    const instances = await transaction.select().from(planningClarificationInstances).where(and(eq(planningClarificationInstances.sessionId, session.id), inArray(planningClarificationInstances.id, input.assumptions.map((item) => item.instanceId)))).for("update");
    if (instances.length !== new Set(input.assumptions.map((item) => item.instanceId)).size || instances.some((item) => item.state !== "collecting")) return null;
    for (const assumption of input.assumptions) {
      const instance = instances.find((item) => item.id === assumption.instanceId)!;
      const profile = planningContextCatalog.profiles[instance.kind as keyof typeof planningContextCatalog.profiles];
      const field = profile?.fields.find((item) => item.key === assumption.key);
      const scopes = validatePlanningScopeGraph(session.scopeGraph as ValidatedPlanningContext["scopes"]);
      if (!scopes || !field || field.safeAssumption !== "permitted" || field.valueSchemaVersion !== assumption.schemaVersion || !field.scopes.includes(scopes.find((scope) => scope.id === assumption.scopeId)?.kind ?? "journey") || !["equal", "ancestor"].includes(comparePlanningScopes(scopes, assumption.scopeId, instance.scopeId) ?? "unrelated") || validatePlanningValues(profile, scopes, [{ key: assumption.key, value: assumption.value, scopeId: assumption.scopeId, schemaVersion: assumption.schemaVersion, precedence: field.precedence }]).length !== 1) return null;
    }
    await transaction.insert(planningClarificationAssumptions).values(input.assumptions.map((item) => ({ sessionId: session.id, ...item }))).onConflictDoNothing();
    const persisted = await transaction.select().from(planningClarificationAssumptions).where(eq(planningClarificationAssumptions.sessionId, session.id));
    for (const instance of instances) {
      if (instance.state !== "collecting") continue;
      const profile = planningContextCatalog.profiles[instance.kind as keyof typeof planningContextCatalog.profiles]!;
      const values = await transaction.select().from(planningClarificationValues).where(eq(planningClarificationValues.sessionId, session.id));
      const completeness = evaluatePlanningCompleteness(profile, session.scopeGraph as ValidatedPlanningContext["scopes"], instance.scopeId, values as ScopedPlanningValue[]);
      const disclosed = new Set(persisted.filter((item) => item.instanceId === instance.id && item.disclosed).map((item) => item.key));
      if (completeness.ready && completeness.assumed.every((key) => disclosed.has(key))) await transaction.update(planningClarificationInstances).set({ state: "ready", revision: instance.revision + 1, updatedAt: new Date() }).where(and(eq(planningClarificationInstances.id, instance.id), eq(planningClarificationInstances.revision, instance.revision)));
    }
    await writeFieldStates(transaction, session.id, validatePlanningScopeGraph(session.scopeGraph as ValidatedPlanningContext["scopes"])!, instances, await transaction.select().from(planningClarificationValues).where(eq(planningClarificationValues.sessionId, session.id)) as ScopedPlanningValue[], new Set(persisted.filter((item) => item.disclosed).map((item) => `${item.instanceId}\u0000${item.key}`)));
    return transaction.update(planningClarificationSessions).set({ revision: session.revision + 1, updatedAt: new Date() }).where(and(eq(planningClarificationSessions.id, session.id), eq(planningClarificationSessions.revision, session.revision))).returning();
  });
}

export async function claimReadyClarificationInstances(input: { userId: string; sessionId: string; commandId: string; expectedSessionRevision: number; expectedContentRevision: number; instanceIds: readonly string[] }) {
  if (!input.instanceIds.length || new Set(input.instanceIds).size !== input.instanceIds.length) return null;
  return getDb().transaction(async (transaction) => {
    const [session] = await transaction.select().from(planningClarificationSessions).where(and(eq(planningClarificationSessions.id, input.sessionId), eq(planningClarificationSessions.userId, input.userId), eq(planningClarificationSessions.state, "active"), eq(planningClarificationSessions.revision, input.expectedSessionRevision), eq(planningClarificationSessions.contentRevision, input.expectedContentRevision))).limit(1).for("update");
    const [command] = await transaction.select({ id: aiAskCommands.id, conversationId: aiAskCommands.conversationId, tripProjectId: aiAskCommands.tripProjectId, status: aiAskCommands.status, conversationLifecycleVersion: aiAskCommands.conversationLifecycleVersion, tripProjectAggregateVersion: aiAskCommands.tripProjectAggregateVersion }).from(aiAskCommands).where(and(eq(aiAskCommands.id, input.commandId), eq(aiAskCommands.userId, input.userId))).limit(1);
    const [conversation] = session ? await transaction.select({ lifecycleVersion: conversations.lifecycleVersion, contentRevision: conversations.contentRevision }).from(conversations).where(and(eq(conversations.id, session.conversationId), eq(conversations.userId, input.userId))).limit(1).for("update") : [];
    const [project] = session?.tripProjectId ? await transaction.select({ aggregateVersion: tripProjects.aggregateVersion }).from(tripProjects).where(and(eq(tripProjects.id, session.tripProjectId), eq(tripProjects.userId, input.userId))).limit(1).for("update") : [];
    const [proposal] = session?.proposalId ? await transaction.select({ id: tripChangeProposals.id, version: tripChangeProposals.version, status: tripChangeProposals.status }).from(tripChangeProposals).where(and(eq(tripChangeProposals.id, session.proposalId), eq(tripChangeProposals.userId, input.userId), eq(tripChangeProposals.tripProjectId, session.tripProjectId!))).limit(1).for("update") : [];
    if (!session || !command || !conversation || !proposalPinMatches(session.proposalId, session.proposalVersion, proposal) || conversation.contentRevision !== session.contentRevision || conversation.lifecycleVersion !== session.conversationLifecycleVersion || command.status !== "pending" || command.conversationId !== session.conversationId || command.tripProjectId !== session.tripProjectId || command.conversationLifecycleVersion !== session.conversationLifecycleVersion || command.tripProjectAggregateVersion !== session.tripProjectAggregateVersion || (session.tripProjectId !== null && (!project || project.aggregateVersion !== session.tripProjectAggregateVersion || command.tripProjectAggregateVersion !== project.aggregateVersion))) return null;
    const instances = await transaction.select().from(planningClarificationInstances).where(and(eq(planningClarificationInstances.sessionId, session.id), inArray(planningClarificationInstances.id, [...input.instanceIds]))).for("update");
    if (instances.length !== input.instanceIds.length || instances.some((item) => item.state !== "ready")) return null;
    await transaction.insert(planningClarificationClaims).values(instances.map((item) => ({ userId: input.userId, conversationId: session.conversationId, sessionId: session.id, instanceId: item.id, commandId: input.commandId, sessionRevision: session.revision, contentRevision: session.contentRevision })));
    for (const item of instances) await transaction.update(planningClarificationInstances).set({ state: "claimed", revision: item.revision + 1, updatedAt: new Date() }).where(and(eq(planningClarificationInstances.id, item.id), eq(planningClarificationInstances.revision, item.revision)));
    return instances.map((item) => item.id);
  });
}

export async function completeOrAbandonClarificationClaims(input: { userId: string; sessionId: string; commandId: string; expectedSessionRevision: number; expectedContentRevision: number; instanceIds: readonly string[]; outcome: "completed" | "abandoned" }) {
  if (!input.instanceIds.length || new Set(input.instanceIds).size !== input.instanceIds.length) return null;
  return getDb().transaction(async (transaction) => {
    const [session] = await transaction.select().from(planningClarificationSessions).where(and(eq(planningClarificationSessions.id, input.sessionId), eq(planningClarificationSessions.userId, input.userId), eq(planningClarificationSessions.state, "active"), eq(planningClarificationSessions.revision, input.expectedSessionRevision), eq(planningClarificationSessions.contentRevision, input.expectedContentRevision))).limit(1).for("update");
    const [conversation] = session ? await transaction.select({ contentRevision: conversations.contentRevision, lifecycleVersion: conversations.lifecycleVersion }).from(conversations).where(and(eq(conversations.id, session.conversationId), eq(conversations.userId, input.userId))).limit(1).for("update") : [];
    const [command] = session ? await transaction.select({ id: aiAskCommands.id, conversationId: aiAskCommands.conversationId, tripProjectId: aiAskCommands.tripProjectId, status: aiAskCommands.status, conversationLifecycleVersion: aiAskCommands.conversationLifecycleVersion, tripProjectAggregateVersion: aiAskCommands.tripProjectAggregateVersion }).from(aiAskCommands).where(and(eq(aiAskCommands.id, input.commandId), eq(aiAskCommands.userId, input.userId))).limit(1).for("update") : [];
    const [project] = session?.tripProjectId ? await transaction.select({ aggregateVersion: tripProjects.aggregateVersion }).from(tripProjects).where(and(eq(tripProjects.id, session.tripProjectId), eq(tripProjects.userId, input.userId))).limit(1).for("update") : [];
    const [proposal] = session?.proposalId ? await transaction.select({ id: tripChangeProposals.id, version: tripChangeProposals.version, status: tripChangeProposals.status }).from(tripChangeProposals).where(and(eq(tripChangeProposals.id, session.proposalId), eq(tripChangeProposals.userId, input.userId), eq(tripChangeProposals.tripProjectId, session.tripProjectId!))).limit(1).for("update") : [];
    if (!session || !conversation || !command || !proposalPinMatches(session.proposalId, session.proposalVersion, proposal) || command.status !== "pending" || command.conversationId !== session.conversationId || command.tripProjectId !== session.tripProjectId || command.conversationLifecycleVersion !== session.conversationLifecycleVersion || command.tripProjectAggregateVersion !== session.tripProjectAggregateVersion || conversation.lifecycleVersion !== session.conversationLifecycleVersion || conversation.contentRevision !== session.contentRevision || (session.tripProjectId !== null && (!project || project.aggregateVersion !== session.tripProjectAggregateVersion))) return null;
    const claims = await transaction.select().from(planningClarificationClaims).where(and(eq(planningClarificationClaims.sessionId, session.id), eq(planningClarificationClaims.commandId, input.commandId), inArray(planningClarificationClaims.instanceId, [...input.instanceIds]), eq(planningClarificationClaims.state, "live"))).for("update");
    if (claims.length !== input.instanceIds.length || claims.some((claim) => claim.contentRevision !== session.contentRevision || claim.sessionRevision > session.revision)) return null;
    const instances = await transaction.select().from(planningClarificationInstances).where(and(eq(planningClarificationInstances.sessionId, session.id), inArray(planningClarificationInstances.id, [...input.instanceIds]))).for("update");
    if (instances.length !== input.instanceIds.length || instances.some((item) => item.state !== "claimed")) return null;
    await transaction.update(planningClarificationClaims).set({ state: input.outcome }).where(inArray(planningClarificationClaims.id, claims.map((item) => item.id)));
    for (const instance of instances) {
      const [updatedInstance] = await transaction.update(planningClarificationInstances).set({ state: input.outcome, revision: instance.revision + 1, updatedAt: new Date() }).where(and(eq(planningClarificationInstances.id, instance.id), eq(planningClarificationInstances.revision, instance.revision))).returning({ id: planningClarificationInstances.id });
      if (!updatedInstance) throw new Error("Clarification instance CAS failed.");
    }
    const remaining = await transaction.select({ id: planningClarificationInstances.id }).from(planningClarificationInstances).where(and(eq(planningClarificationInstances.sessionId, session.id), inArray(planningClarificationInstances.state, ["collecting", "ready", "claimed"])));
    const [updated] = await transaction.update(planningClarificationSessions).set({ state: remaining.length === 0 ? "completed" : "active", revision: session.revision + 1, updatedAt: new Date() }).where(and(eq(planningClarificationSessions.id, session.id), eq(planningClarificationSessions.revision, session.revision))).returning();
    return updated ?? null;
  });
}

function attemptMatchesContext(attempt: { payload: Record<string, unknown>; digest: string }, context: ValidatedPlanningContext) {
  return attempt.digest === createHash("sha256").update(canonicalJson(attempt.payload)).digest("hex")
    && attempt.payload.graphDigest === context.graphDigest
    && attempt.payload.profileVersion === context.versions.profileVersion
    && attempt.payload.policyVersion === context.versions.policyVersion
    && attempt.payload.comparatorVersion === context.versions.comparatorVersion
    && sameRecord(attempt.payload.valueSchemaVersions, context.versions.valueSchemaVersions);
}

function pinnedSessionMatchesCatalog(session: { profileVersion: string; policyVersion: string; comparatorVersion: string }) {
  return session.profileVersion === planningContextCatalog.policy.version.replace("policy", "profile")
    && session.policyVersion === planningContextCatalog.policy.version
    && session.comparatorVersion === planningContextCatalog.policy.comparatorVersion;
}
function proposalPinMatches(proposalId: string | null, proposalVersion: number | null, proposal: { id: string; version: number; status: string } | undefined) { return proposalId === null ? proposalVersion === null : proposalVersion !== null && proposal?.id === proposalId && proposal.version === proposalVersion && proposal.status === "pending"; }

async function writeFieldStates(transaction: Parameters<ReturnType<typeof getDb>["transaction"]>[0] extends (value: infer T) => unknown ? T : never, sessionId: string, scopes: ValidatedPlanningContext["scopes"], instances: Array<{ id: string; kind: string; scopeId: string }>, values: ScopedPlanningValue[], disclosedAssumptions = new Set<string>(), keys?: ReadonlySet<string>) {
  for (const instance of instances) {
    const profile = planningContextCatalog.profiles[instance.kind as keyof typeof planningContextCatalog.profiles];
    if (!profile) continue;
    for (const field of profile.fields) {
      if (keys && !keys.has(field.key)) continue;
      const effective = evaluateEffectivePlanningValue(profile, field.key, scopes, instance.scopeId, values);
      const completeness = evaluatePlanningCompleteness(profile, scopes, instance.scopeId, values);
      const state = effective.status === "resolved" ? "resolved" : effective.status === "ambiguous" ? "ambiguous" : completeness.assumed.includes(field.key) && disclosedAssumptions.has(`${instance.id}\u0000${field.key}`) ? "assumed" : "missing";
      const candidates = validatePlanningValues(profile, scopes, values).filter((value) => value.key === field.key && ["equal", "ancestor", "overlap"].includes(comparePlanningScopes(scopes, value.scopeId, instance.scopeId) ?? "unrelated")).map((value) => ({ value: value.value, scopeId: value.scopeId }));
      await transaction.insert(planningClarificationFieldStates).values({ sessionId, instanceId: instance.id, key: field.key, state, candidates }).onConflictDoUpdate({ target: [planningClarificationFieldStates.instanceId, planningClarificationFieldStates.key], set: { state, candidates, updatedAt: new Date() } });
    }
  }
}

function sameRecord(value: unknown, expected: Readonly<Record<string, string>>) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === Object.keys(expected).length && Object.entries(expected).every(([key, item]) => (value as Record<string, unknown>)[key] === item); }
function canonicalJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`; return JSON.stringify(value); }
function persistedScopedValue(value: { key: string; value: string; scopeId: string; schemaVersion: string; precedence: string }): ScopedPlanningValue | null { return value.precedence === "nearest_ancestor" || value.precedence === "explicit_compatible" ? { key: value.key, value: value.value, scopeId: value.scopeId, schemaVersion: value.schemaVersion, precedence: value.precedence } : null; }
function extractionMatchesValues(payload: Record<string, unknown>, values: readonly ClarificationEvidence[]) { return Array.isArray(payload.values) && canonicalJson(payload.values) === canonicalJson(values); }
function validatedContext(context: ValidatedPlanningContext) { const resolved = resolvePlanningContext({ versions: context.versions, scopes: context.scopes, deliverables: context.deliverables.map(({ id, kind, scopeId }) => ({ id, kind, scopeId })) }); return resolved !== null && resolved.graphDigest === context.graphDigest && canonicalJson(resolved) === canonicalJson(context); }
function affectedBy(values: readonly ClarificationEvidence[], profile: typeof planningContextCatalog.profiles[keyof typeof planningContextCatalog.profiles] | undefined, scopes: ValidatedPlanningContext["scopes"], instanceScopeId: string) { return Boolean(profile && values.some((value) => profile.fields.some((field) => field.key === value.key) && ["equal", "ancestor", "descendant", "overlap"].includes(comparePlanningScopes(scopes, value.scopeId, instanceScopeId) ?? "unrelated"))); }
