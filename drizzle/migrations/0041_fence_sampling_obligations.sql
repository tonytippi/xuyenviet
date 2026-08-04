alter table "knowledge_ingestion_candidates" add column "completed_content_version" integer;
--> statement-breakpoint
alter table "knowledge_ingestion_candidates" add column "completed_evidence_set_revision" integer;
--> statement-breakpoint
alter table "knowledge_ingestion_candidates" add constraint "knowledge_ingestion_candidates_completion_fence_check" check (("completed_content_version" is null and "completed_evidence_set_revision" is null) or ("processing_status" = 'completed' and "knowledge_card_id" is not null and "completed_content_version" >= 1 and "completed_evidence_set_revision" >= 1));
--> statement-breakpoint
create or replace function protect_knowledge_sampling_obligation() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (new.candidate_id, new.knowledge_card_id, new.content_version, new.evidence_set_revision) is distinct from (old.candidate_id, old.knowledge_card_id, old.content_version, old.evidence_set_revision) then
    raise exception 'sampling obligation identity is immutable';
  end if;
  if tg_op = 'UPDATE' and old.sampling_disposition is not null and new.sampling_disposition is distinct from old.sampling_disposition then
    raise exception 'sampling disposition is terminal';
  end if;
  if tg_op = 'INSERT' and not exists (select 1 from knowledge_ingestion_candidates candidate where candidate.id = new.candidate_id and candidate.processing_status = 'completed' and candidate.ai_disposition = 'needs_operator' and candidate.knowledge_card_id = new.knowledge_card_id and candidate.completed_content_version = new.content_version and candidate.completed_evidence_set_revision = new.evidence_set_revision) then
    raise exception 'sampling obligation requires its completed needs_operator candidate fence';
  end if;
  return new;
end $$;
