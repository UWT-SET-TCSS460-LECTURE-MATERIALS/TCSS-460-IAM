-- Seed template for new quarter/tenant setup
-- Copy and modify for each new offering
-- Run after Prisma migration is applied

-- Example: TCSS 460 Spring 2026
INSERT INTO tenant (tenant_id, tenant_name, description, is_active, auto_provision, default_role, branding_name, branding_color)
VALUES ('tcss460-sp26', 'TCSS 460 Spring 2026', 'Client/Server Programming course project', true, true, 1, 'TCSS 460 Spring 2026', '#4B2E83')
ON CONFLICT (tenant_id) DO NOTHING;

-- Shared dev client for student FE template defaults
INSERT INTO oauth_client (client_id, client_secret, client_name, tenant_id, redirect_uris)
VALUES (
    'tcss460-dev-shared',
    'REPLACE_WITH_GENERATED_SECRET',
    'TCSS 460 Dev (Shared)',
    'tcss460-sp26',
    ARRAY['http://localhost:3000/api/auth/callback/tcss460', 'http://localhost:3000/auth/callback']
)
ON CONFLICT (client_id) DO NOTHING;

-- Per-group clients (create one per student group)
-- INSERT INTO oauth_client (client_id, client_secret, client_name, tenant_id, redirect_uris)
-- VALUES (
--     'tcss460-group-01',
--     'REPLACE_WITH_GENERATED_SECRET',
--     'TCSS 460 Group 1',
--     'tcss460-sp26',
--     ARRAY['http://localhost:3000/api/auth/callback/tcss460', 'https://group1-app.onrender.com/api/auth/callback/tcss460']
-- );
