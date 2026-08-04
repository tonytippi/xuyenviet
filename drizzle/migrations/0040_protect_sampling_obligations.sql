create table "knowledge_sampling_recommendation_obligations" (
  "recommendation_id" text not null references "knowledge_recommendations"("id") on delete cascade,
  "obligation_id" text not null references "knowledge_sampling_obligations"("id") on delete restrict,
  "created_at" timestamp default now() not null,
  primary key ("recommendation_id", "obligation_id")
);
--> statement-breakpoint
create index "knowledge_sampling_recommendation_obligations_obligation_idx" on "knowledge_sampling_recommendation_obligations" ("obligation_id");
--> statement-breakpoint
create or replace function protect_knowledge_sampling_obligation() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (new.candidate_id, new.knowledge_card_id, new.content_version, new.evidence_set_revision) is distinct from (old.candidate_id, old.knowledge_card_id, old.content_version, old.evidence_set_revision) then
    raise exception 'sampling obligation identity is immutable';
  end if;
  if tg_op = 'UPDATE' and old.sampling_disposition is not null and new.sampling_disposition is distinct from old.sampling_disposition then
    raise exception 'sampling disposition is terminal';
  end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from knowledge_ingestion_candidates candidate where candidate.id = new.candidate_id and candidate.processing_status = 'completed' and candidate.ai_disposition = 'needs_operator' and candidate.knowledge_card_id = new.knowledge_card_id) then
      raise exception 'sampling obligation requires its completed needs_operator candidate';
    end if;
  end if;
  return new;
end $$;
--> statement-breakpoint
create trigger protect_knowledge_sampling_obligation_trigger before insert or update on "knowledge_sampling_obligations" for each row execute function protect_knowledge_sampling_obligation();
--> statement-breakpoint
create or replace function protect_knowledge_sampling_recommendation_obligation() returns trigger language plpgsql as $$
begin
  if not exists (
    select 1
    from knowledge_recommendations recommendation
    join knowledge_sampling_obligations obligation on obligation.id = new.obligation_id
    where recommendation.id = new.recommendation_id
      and recommendation.work_type = 'sampling'
      and recommendation.knowledge_card_id = obligation.knowledge_card_id
      and recommendation.content_version = obligation.content_version
      and recommendation.evidence_set_revision = obligation.evidence_set_revision
  ) then
    raise exception 'sampling work may measure only matching sampling obligations';
  end if;
  return new;
end $$;
--> statement-breakpoint
create trigger protect_knowledge_sampling_recommendation_obligation_trigger before insert or update on "knowledge_sampling_recommendation_obligations" for each row execute function protect_knowledge_sampling_recommendation_obligation();
