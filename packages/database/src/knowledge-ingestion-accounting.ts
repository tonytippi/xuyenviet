import { sql, type SQL } from "drizzle-orm";

type AccountingTransaction = { execute: (query: SQL) => Promise<unknown> };

/**
 * Technical ingestion observability is derived from durable candidate rows so
 * retries and duplicate delivery cannot inflate parent counters.
 */
export async function projectKnowledgeIngestionAccounting(
  transaction: AccountingTransaction,
  jobId: string,
  now = new Date(),
) {
  await transaction.execute(sql`
    update knowledge_ingestion_jobs
    set candidate_count = (select count(*)::int from knowledge_ingestion_candidates where ingestion_job_id = ${jobId}),
        completed_candidate_count = (select count(*)::int from knowledge_ingestion_candidates where ingestion_job_id = ${jobId} and processing_status = 'completed'),
        failed_candidate_count = (select count(*)::int from knowledge_ingestion_candidates where ingestion_job_id = ${jobId} and processing_status = 'failed'),
        needs_operator_candidate_count = (select count(*)::int from knowledge_ingestion_candidates where ingestion_job_id = ${jobId} and processing_status = 'completed' and ai_disposition = 'needs_operator'),
        updated_at = ${now.toISOString()}::timestamptz
    where id = ${jobId}
  `);
}

/** Completes only a technically terminal parent and clears its lease atomically. */
export async function projectAndFinalizeKnowledgeIngestionJob(
  transaction: AccountingTransaction,
  jobId: string,
  now = new Date(),
) {
  await projectKnowledgeIngestionAccounting(transaction, jobId, now);
  await transaction.execute(sql`
    update knowledge_ingestion_jobs
    set status = 'completed', claimed_by = null, claimed_at = null,
        lease_expires_at = null, fencing_token = null,
        updated_at = ${now.toISOString()}::timestamptz
    where id = ${jobId}
      and discovery_terminal = true
      and status in ('queued', 'running')
      and not exists (
        select 1 from knowledge_ingestion_candidates
        where ingestion_job_id = ${jobId}
          and processing_status in ('queued', 'processing')
      )
  `);
}
