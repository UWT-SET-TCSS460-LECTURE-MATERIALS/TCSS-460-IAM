-- Add auto_activate flag to tenants
-- When true, new accounts registered via the OAuth-hosted register page
-- are created with account_status='active' instead of 'pending'.
-- Safe for shared databases: additive, idempotent, defaults to false.

ALTER TABLE "a2_tenant" ADD COLUMN IF NOT EXISTS "auto_activate" BOOLEAN NOT NULL DEFAULT false;
