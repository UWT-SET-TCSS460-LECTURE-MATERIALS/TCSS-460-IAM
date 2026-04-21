-- v2 OAuth: Add API resources, client audience grants, and audience/scope on auth codes + refresh tokens
-- Safe for shared databases: only creates new tables and adds nullable columns to a2_* tables
-- All statements are idempotent (IF NOT EXISTS / DO $$ guards)

-- New columns on existing tables (nullable, no data loss)
ALTER TABLE "a2_oauth_authorization_code" ADD COLUMN IF NOT EXISTS "scope" VARCHAR(512);
ALTER TABLE "a2_oauth_authorization_code" ADD COLUMN IF NOT EXISTS "audience" VARCHAR(255);
ALTER TABLE "a2_oauth_refresh_token" ADD COLUMN IF NOT EXISTS "audience" VARCHAR(255);

-- New table: API resources (audience identifiers scoped to tenants)
CREATE TABLE IF NOT EXISTS "a2_api_resource" (
    "resource_id" TEXT NOT NULL,
    "tenant_id" VARCHAR(255) NOT NULL,
    "identifier" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "a2_api_resource_pkey" PRIMARY KEY ("resource_id")
);

-- New table: which OAuth clients may request tokens for which API resources
CREATE TABLE IF NOT EXISTS "a2_client_allowed_audience" (
    "client_id" VARCHAR(255) NOT NULL,
    "api_resource_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "a2_client_allowed_audience_pkey" PRIMARY KEY ("client_id", "api_resource_id")
);

-- Unique constraint: one API resource identifier per tenant
CREATE UNIQUE INDEX IF NOT EXISTS "a2_api_resource_tenant_id_identifier_key"
    ON "a2_api_resource"("tenant_id", "identifier");

-- Foreign keys (guarded — PostgreSQL doesn't support IF NOT EXISTS on constraints)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'a2_api_resource_tenant_id_fkey') THEN
        ALTER TABLE "a2_api_resource"
            ADD CONSTRAINT "a2_api_resource_tenant_id_fkey"
            FOREIGN KEY ("tenant_id") REFERENCES "a2_tenant"("tenant_id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'a2_client_allowed_audience_client_id_fkey') THEN
        ALTER TABLE "a2_client_allowed_audience"
            ADD CONSTRAINT "a2_client_allowed_audience_client_id_fkey"
            FOREIGN KEY ("client_id") REFERENCES "a2_oauth_client"("client_id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'a2_client_allowed_audience_api_resource_id_fkey') THEN
        ALTER TABLE "a2_client_allowed_audience"
            ADD CONSTRAINT "a2_client_allowed_audience_api_resource_id_fkey"
            FOREIGN KEY ("api_resource_id") REFERENCES "a2_api_resource"("resource_id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
