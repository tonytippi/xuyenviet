CREATE INDEX "knowledge_recommendations_status_queue_idx" ON "knowledge_recommendations" USING btree ("status", "priority", "created_at");
