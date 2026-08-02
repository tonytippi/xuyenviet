-- Facebook evidence remains non-disclosable to travelers, but can support the
-- normalized card fact in retrieval. Search projection omits its quote and URL.
update knowledge_card_evidence as evidence
set display_policy = 'fact_only'
from sources as source
where source.id = evidence.source_id
  and source.kind = 'facebook'
  and evidence.display_policy = 'operator_only';

-- The display-policy correction makes existing active cards eligible again.
-- Queue their current version so the worker rebuilds each projection.
insert into knowledge_index_dirty_markers (
  id,
  knowledge_card_id,
  content_version,
  evidence_set_revision,
  reason,
  status,
  next_run_at,
  max_attempts
)
select distinct
  gen_random_uuid()::text,
  card.id,
  card.content_version,
  card.evidence_set_revision,
  'facebook_evidence_policy_backfill',
  'pending',
  clock_timestamp(),
  5
from knowledge_cards as card
join knowledge_card_evidence as evidence
  on evidence.knowledge_card_id = card.id
join sources as source
  on source.id = evidence.source_id
where source.kind = 'facebook'
  and evidence.state = 'active'
  and evidence.support_level in ('primary', 'supporting')
  and evidence.display_policy = 'fact_only'
on conflict (knowledge_card_id, content_version) do update
set evidence_set_revision = excluded.evidence_set_revision,
    reason = excluded.reason,
    status = 'pending',
    next_run_at = excluded.next_run_at,
    claimed_by = null,
    claimed_at = null,
    lease_expires_at = null,
    fencing_token = null,
    completed_at = null,
    completion_reason = null,
    failure_code = null,
    failure_reason = null,
    updated_at = clock_timestamp();
