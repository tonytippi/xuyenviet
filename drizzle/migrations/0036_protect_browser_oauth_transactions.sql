-- Transactions live for ten minutes; discard legacy plaintext rather than retaining it.
DELETE FROM "browser_oauth_transactions";
ALTER TABLE "browser_oauth_transactions" RENAME COLUMN "state" TO "state_hash";
ALTER TABLE "browser_oauth_transactions" RENAME COLUMN "code_verifier" TO "code_verifier_ciphertext";
