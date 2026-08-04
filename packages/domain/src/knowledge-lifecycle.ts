export type AuditActor =
  | Readonly<{ kind: "user"; userId: string; email: string }>
  | Readonly<{ kind: "system"; system: "system-ai-orchestration" | "system-knowledge-pipeline" | "system-trip-planning" | "system-facebook-capture" | "system-youtube-capture" | "system-admin-bootstrap" }>;

export type KnowledgeLifecycleFence = Readonly<{
  contentVersion?: number;
  evidenceSetRevision?: number;
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
  | Readonly<{ kind: "operator_resolution"; recommendationId: string; resolution: "published_operator_confirmed" | "published_community_observation" | "suppressed" | "edited_and_requeued" | "relation_resolved" | "sampling_passed" | "sampling_failed" }>
  | Readonly<{ kind: "draft_publish"; cardId: string }>
  | Readonly<{ kind: "open_work"; cardId: string; workType: "verification" | "relation" | "risk" | "missing_context" | "sampling"; policyId?: string; policySnapshot?: Record<string, unknown> }>
  | Readonly<{ kind: "content_refresh"; cardId: string; reason: "source_label" }>
  | Readonly<{ kind: "support_loss"; cardId: string; reason: "source_withdrawn" | "evidence_withdrawn" }>
  | Readonly<{ kind: "archive"; cardId: string }>
  | Readonly<{ kind: "restore"; recommendationId: string }>;

export type TransitionKnowledgeCardInput = Readonly<{
  trigger: KnowledgeLifecycleTrigger;
  actor: AuditActor;
  fences: KnowledgeLifecycleFence;
}>;

export type TransitionKnowledgeCardResult =
  | Readonly<{ status: "resolved"; cardId: string; contentVersion: number; evidenceSetRevision: number }>
  | Readonly<{ status: "stale" }>
  | Readonly<{ status: "invalid"; reason: string }>;
