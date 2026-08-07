ALTER TABLE "youtube_discovery_query_proposals" DROP CONSTRAINT "youtube_discovery_query_proposals_reason_check";
--> statement-breakpoint
ALTER TABLE "youtube_discovery_query_proposals" ADD CONSTRAINT "youtube_discovery_query_proposals_reason_check" CHECK ("reason" IN ('coverage_gap', 'freshness_risk', 'unresolved_conflict', 'anonymized_demand', 'operator_request'));
--> statement-breakpoint
ALTER TABLE "youtube_discovery_query_proposals" DROP CONSTRAINT "youtube_discovery_query_proposals_query_check";
--> statement-breakpoint
ALTER TABLE "youtube_discovery_query_proposals" ADD CONSTRAINT "youtube_discovery_query_proposals_query_check" CHECK (length(btrim("query_text")) BETWEEN 1 AND 240 AND position(chr(10) IN "query_text") = 0 AND position(chr(13) IN "query_text") = 0 AND "query_text" !~* '(https?://|www\\.|[?&](token|secret|code|key|signature|password)=)');
