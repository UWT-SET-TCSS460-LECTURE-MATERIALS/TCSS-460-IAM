-- Add must_change_password flag to accounts.
-- Set true when admin issues a temp password; cleared on next successful
-- password change. While true, login pathways redirect users to the
-- hosted change-password page before issuing tokens / OAuth codes.
-- Safe for shared databases: additive, idempotent, defaults to false.

ALTER TABLE "a2_account" ADD COLUMN IF NOT EXISTS "must_change_password" BOOLEAN NOT NULL DEFAULT false;
