export type AuditActor =
  | Readonly<{ kind: "user"; userId: string; email: string }>
  | Readonly<{ kind: "system"; system: "system-ai-orchestration" | "system-knowledge-pipeline" | "system-trip-planning" | "system-facebook-capture" | "system-youtube-capture" | "system-admin-bootstrap" }>;

export type KnowledgeVersionFence = Readonly<{
  contentVersion: number;
  evidenceSetRevision: number;
}>;

export type KnowledgeLifecycleFence = KnowledgeVersionFence & Readonly<{
  candidateFencingToken?: string;
  recommendationId?: string;
}>;

export type KnowledgeRelationFact =
  | Readonly<{ kind: "attach"; targetCardId: string; shortlistCardIds: readonly string[]; rationale: string }>
  | Readonly<{ kind: "create"; rationale: string }>
  | Readonly<{ kind: "conflict"; targetCardId: string; shortlistCardIds: readonly string[]; rationale: string }>
  | Readonly<{ kind: "ambiguous"; shortlistCardIds: readonly string[]; rationale: string }>;

export type KnowledgeLifecycleTrigger =
  | Readonly<{ kind: "candidate_relation"; candidateId: string; disposition: "apply" | "needs_operator"; outcomeReasonCode: "applied" | "verification_required" | "relation_ambiguous" | "missing_context" | "conflict"; relation: KnowledgeRelationFact }>
  | Readonly<{ kind: "operator_resolution"; recommendationId: string; resolution: "published_operator_confirmed" | "published_community_observation" | "suppressed" | "edited_and_requeued" | "relation_resolved" | "sampling_passed" | "sampling_failed"; highSeverity?: boolean }>
  | Readonly<{ kind: "sampling_containment"; policyId: string; enrollmentDigest: string; recommendationId: string; members: readonly { cardId: string; contentVersion: number; evidenceSetRevision: number; disposition: "remediable" | "unsafe" }[] }>
  | Readonly<{ kind: "draft_publish"; cardId: string }>
  | Readonly<{ kind: "open_work"; cardId: string; workType: "verification" | "relation" | "risk" | "missing_context" | "sampling"; policyId?: string; policySnapshot?: Record<string, unknown>; obligationIds?: readonly string[] }>
  | Readonly<{ kind: "content_refresh"; cardId: string; reason: "source_label" }>
  | Readonly<{ kind: "support_loss"; cardId: string; reason: "source_withdrawn" | "evidence_withdrawn" | "source_recaptured" }>
  | Readonly<{ kind: "archive"; cardId: string }>
  | Readonly<{ kind: "restore"; cardId?: string; recommendationId?: string; target: "active" | "pending_operator" }>;

type TransitionInput<T extends KnowledgeLifecycleTrigger, Fences> = Readonly<{
  trigger: T;
  actor: AuditActor;
  fences: Fences;
}>;

export type TransitionKnowledgeCardInput =
  | TransitionInput<Extract<KnowledgeLifecycleTrigger, { kind: "candidate_relation" }>, Readonly<{ candidateFencingToken: string }>>
  | TransitionInput<Extract<KnowledgeLifecycleTrigger, { kind: "sampling_containment" }>, KnowledgeVersionFence & Readonly<{ recommendationId: string }>>
  | TransitionInput<Exclude<KnowledgeLifecycleTrigger, { kind: "candidate_relation" }>, KnowledgeVersionFence & Readonly<{ recommendationId?: string }>>;

export type TransitionKnowledgeCardResult =
  | Readonly<{ status: "resolved"; cardId: string; contentVersion: number; evidenceSetRevision: number }>
  | Readonly<{ status: "stale" }>
  | Readonly<{ status: "invalid"; reason: string }>;
