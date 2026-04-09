-- CreateTable
CREATE TABLE "a2_account" (
    "account_id" SERIAL NOT NULL,
    "firstname" VARCHAR(255) NOT NULL,
    "lastname" VARCHAR(255) NOT NULL,
    "username" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "phone" VARCHAR(15) NOT NULL,
    "phone_verified" BOOLEAN NOT NULL DEFAULT false,
    "account_role" INTEGER NOT NULL,
    "account_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "a2_account_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "a2_account_credential" (
    "credential_id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "salted_hash" VARCHAR(255) NOT NULL,
    "salt" VARCHAR(255),

    CONSTRAINT "a2_account_credential_pkey" PRIMARY KEY ("credential_id")
);

-- CreateTable
CREATE TABLE "a2_email_verification" (
    "verification_id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "verification_token" VARCHAR(64) NOT NULL,
    "token_expires" TIMESTAMPTZ NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "a2_email_verification_pkey" PRIMARY KEY ("verification_id")
);

-- CreateTable
CREATE TABLE "a2_phone_verification" (
    "verification_id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "phone" VARCHAR(15) NOT NULL,
    "verification_code" VARCHAR(6) NOT NULL,
    "code_expires" TIMESTAMPTZ NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "a2_phone_verification_pkey" PRIMARY KEY ("verification_id")
);

-- CreateTable
CREATE TABLE "a2_tenant" (
    "tenant_id" VARCHAR(255) NOT NULL,
    "tenant_name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "auto_provision" BOOLEAN NOT NULL DEFAULT true,
    "default_role" INTEGER NOT NULL DEFAULT 1,
    "branding_name" VARCHAR(255),
    "branding_color" VARCHAR(7),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "a2_tenant_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "a2_tenant_membership" (
    "membership_id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "tenant_id" VARCHAR(255) NOT NULL,
    "role" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "a2_tenant_membership_pkey" PRIMARY KEY ("membership_id")
);

-- CreateTable
CREATE TABLE "a2_oauth_client" (
    "client_id" VARCHAR(255) NOT NULL,
    "client_secret" VARCHAR(255) NOT NULL,
    "client_name" VARCHAR(255) NOT NULL,
    "tenant_id" VARCHAR(255) NOT NULL,
    "redirect_uris" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "a2_oauth_client_pkey" PRIMARY KEY ("client_id")
);

-- CreateTable
CREATE TABLE "a2_oauth_authorization_code" (
    "code" VARCHAR(255) NOT NULL,
    "client_id" VARCHAR(255) NOT NULL,
    "account_id" INTEGER NOT NULL,
    "redirect_uri" VARCHAR(512) NOT NULL,
    "code_challenge" VARCHAR(128),
    "code_challenge_method" VARCHAR(10),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "a2_oauth_authorization_code_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "a2_oauth_refresh_token" (
    "token" VARCHAR(255) NOT NULL,
    "account_id" INTEGER NOT NULL,
    "client_id" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "a2_oauth_refresh_token_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE UNIQUE INDEX "a2_account_username_key" ON "a2_account"("username");

-- CreateIndex
CREATE UNIQUE INDEX "a2_account_email_key" ON "a2_account"("email");

-- CreateIndex
CREATE UNIQUE INDEX "a2_account_phone_key" ON "a2_account"("phone");

-- CreateIndex
CREATE INDEX "idx_a2_account_email" ON "a2_account"("email");

-- CreateIndex
CREATE INDEX "idx_a2_account_phone" ON "a2_account"("phone");

-- CreateIndex
CREATE INDEX "idx_a2_account_username" ON "a2_account"("username");

-- CreateIndex
CREATE INDEX "idx_a2_account_status" ON "a2_account"("account_status");

-- CreateIndex
CREATE UNIQUE INDEX "a2_account_credential_account_id_key" ON "a2_account_credential"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "a2_email_verification_verification_token_key" ON "a2_email_verification"("verification_token");

-- CreateIndex
CREATE INDEX "idx_a2_email_verification_account" ON "a2_email_verification"("account_id");

-- CreateIndex
CREATE INDEX "idx_a2_email_verification_token" ON "a2_email_verification"("verification_token");

-- CreateIndex
CREATE INDEX "idx_a2_email_verification_expires" ON "a2_email_verification"("token_expires");

-- CreateIndex
CREATE INDEX "idx_a2_phone_verification_account" ON "a2_phone_verification"("account_id");

-- CreateIndex
CREATE INDEX "idx_a2_phone_verification_code" ON "a2_phone_verification"("verification_code");

-- CreateIndex
CREATE INDEX "idx_a2_phone_verification_expires" ON "a2_phone_verification"("code_expires");

-- CreateIndex
CREATE UNIQUE INDEX "a2_tenant_membership_account_id_tenant_id_key" ON "a2_tenant_membership"("account_id", "tenant_id");

-- AddForeignKey
ALTER TABLE "a2_account_credential" ADD CONSTRAINT "a2_account_credential_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "a2_account"("account_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "a2_email_verification" ADD CONSTRAINT "a2_email_verification_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "a2_account"("account_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "a2_phone_verification" ADD CONSTRAINT "a2_phone_verification_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "a2_account"("account_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "a2_tenant_membership" ADD CONSTRAINT "a2_tenant_membership_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "a2_account"("account_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "a2_tenant_membership" ADD CONSTRAINT "a2_tenant_membership_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "a2_tenant"("tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "a2_oauth_client" ADD CONSTRAINT "a2_oauth_client_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "a2_tenant"("tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "a2_oauth_authorization_code" ADD CONSTRAINT "a2_oauth_authorization_code_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "a2_oauth_client"("client_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "a2_oauth_authorization_code" ADD CONSTRAINT "a2_oauth_authorization_code_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "a2_account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "a2_oauth_refresh_token" ADD CONSTRAINT "a2_oauth_refresh_token_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "a2_account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "a2_oauth_refresh_token" ADD CONSTRAINT "a2_oauth_refresh_token_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "a2_oauth_client"("client_id") ON DELETE RESTRICT ON UPDATE CASCADE;
