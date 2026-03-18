-- Tenant cleanup template
-- Run after grades are final and grace period has passed
-- Replace 'tcss460-sp26' with the tenant being purged

-- Step 1: Deactivate (run this when the quarter ends)
-- UPDATE tenant SET is_active = false WHERE tenant_id = 'tcss460-sp26';

-- Step 2: Purge tenant-specific data (run after grace period, ~3 months)
-- Order matters due to foreign key constraints

-- Delete refresh tokens for this tenant's clients
DELETE FROM oauth_refresh_token WHERE client_id IN
    (SELECT client_id FROM oauth_client WHERE tenant_id = 'tcss460-sp26');

-- Delete authorization codes for this tenant's clients
DELETE FROM oauth_authorization_code WHERE client_id IN
    (SELECT client_id FROM oauth_client WHERE tenant_id = 'tcss460-sp26');

-- Delete OAuth clients
DELETE FROM oauth_client WHERE tenant_id = 'tcss460-sp26';

-- Delete tenant memberships
DELETE FROM tenant_membership WHERE tenant_id = 'tcss460-sp26';

-- Keep the Tenant row as a tombstone (is_active = false)
-- The global Account rows are NOT deleted — identity persists across tenants
