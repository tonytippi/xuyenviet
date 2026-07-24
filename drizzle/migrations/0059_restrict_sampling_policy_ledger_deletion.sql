ALTER TABLE "knowledge_sampling_cohort_members" DROP CONSTRAINT "knowledge_sampling_cohort_members_policy_id_knowledge_sampling_";--> statement-breakpoint
ALTER TABLE "knowledge_sampling_cohort_members" ADD CONSTRAINT "knowledge_sampling_cohort_policy_fk" FOREIGN KEY ("policy_id") REFERENCES "knowledge_sampling_policies"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "knowledge_sampling_candidate_ledger" DROP CONSTRAINT "knowledge_sampling_candidate_ledger_policy_id_fkey";--> statement-breakpoint
ALTER TABLE "knowledge_sampling_candidate_ledger" ADD CONSTRAINT "knowledge_sampling_candidate_ledger_policy_fk" FOREIGN KEY ("policy_id") REFERENCES "knowledge_sampling_policies"("id") ON DELETE restrict;
