// prisma/seed.ts
// Development seed data for Auth-Squared
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });

const prisma = new PrismaClient({ adapter });

// Replicate the existing SHA256 + salt hashing from credentialingUtils.ts
function generateSaltedHash(password: string): { salt: string; hash: string } {
    const salt = crypto.randomBytes(32).toString('hex');
    const hash = crypto
        .createHash('sha256')
        .update(password + salt)
        .digest('hex');
    return { salt, hash };
}

async function main() {
    console.log('Seeding database...');

    // Create Owner account (Charles)
    const ownerCreds = generateSaltedHash('OwnerPass123!');
    const owner = await prisma.account.upsert({
        where: { email: 'owner@auth2.dev' },
        update: {},
        create: {
            firstName: 'Charles',
            lastName: 'Bryan',
            username: 'owner',
            email: 'owner@auth2.dev',
            phone: '2065550100',
            emailVerified: true,
            phoneVerified: true,
            accountRole: 5, // Owner
            accountStatus: 'active',
            credential: {
                create: {
                    saltedHash: ownerCreds.hash,
                    salt: ownerCreds.salt,
                },
            },
        },
    });
    console.log(`  Created owner: ${owner.email} (role ${owner.accountRole})`);

    // Create Admin account
    const adminCreds = generateSaltedHash('AdminPass123!');
    const admin = await prisma.account.upsert({
        where: { email: 'admin@auth2.dev' },
        update: {},
        create: {
            firstName: 'Admin',
            lastName: 'User',
            username: 'admin',
            email: 'admin@auth2.dev',
            phone: '2065550101',
            emailVerified: true,
            phoneVerified: false,
            accountRole: 3, // Admin
            accountStatus: 'active',
            credential: {
                create: {
                    saltedHash: adminCreds.hash,
                    salt: adminCreds.salt,
                },
            },
        },
    });
    console.log(`  Created admin: ${admin.email} (role ${admin.accountRole})`);

    // Create regular test user
    const userCreds = generateSaltedHash('UserPass123!');
    const user = await prisma.account.upsert({
        where: { email: 'user@auth2.dev' },
        update: {},
        create: {
            firstName: 'Test',
            lastName: 'User',
            username: 'testuser',
            email: 'user@auth2.dev',
            phone: '2065550102',
            emailVerified: false,
            phoneVerified: false,
            accountRole: 1, // User
            accountStatus: 'active',
            credential: {
                create: {
                    saltedHash: userCreds.hash,
                    salt: userCreds.salt,
                },
            },
        },
    });
    console.log(`  Created user: ${user.email} (role ${user.accountRole})`);

    // Create pending user (for verification testing)
    const pendingCreds = generateSaltedHash('PendingPass123!');
    const pending = await prisma.account.upsert({
        where: { email: 'pending@auth2.dev' },
        update: {},
        create: {
            firstName: 'Pending',
            lastName: 'User',
            username: 'pendinguser',
            email: 'pending@auth2.dev',
            phone: '2065550103',
            emailVerified: false,
            phoneVerified: false,
            accountRole: 1,
            accountStatus: 'pending',
            credential: {
                create: {
                    saltedHash: pendingCreds.hash,
                    salt: pendingCreds.salt,
                },
            },
        },
    });
    console.log(
        `  Created pending user: ${pending.email} (status: ${pending.accountStatus})`
    );

    // ============================================================
    // Tenant + OAuth Client Seed Data
    // ============================================================

    // Create TCSS 460 Spring 2026 tenant
    const tcss460Tenant = await prisma.tenant.upsert({
        where: { tenantId: 'tcss460-sp26' },
        update: {},
        create: {
            tenantId: 'tcss460-sp26',
            tenantName: 'TCSS 460 Spring 2026',
            description: 'Client/Server Programming course project',
            isActive: true,
            autoProvision: true,
            defaultRole: 1,
            brandingName: 'TCSS 460 Spring 2026',
            brandingColor: '#4B2E83', // UW purple
        },
    });
    console.log(`  Created tenant: ${tcss460Tenant.tenantId}`);

    // Create AI Tutor tenant
    const aiTutorTenant = await prisma.tenant.upsert({
        where: { tenantId: 'ai-tutor' },
        update: {},
        create: {
            tenantId: 'ai-tutor',
            tenantName: 'AI Tutor',
            description: 'AI tutoring system',
            isActive: true,
            autoProvision: false, // invite-only
            defaultRole: 1,
            brandingName: 'AI Tutor',
            brandingColor: '#198754', // green
        },
    });
    console.log(`  Created tenant: ${aiTutorTenant.tenantId}`);

    // Create shared dev OAuth client for TCSS 460
    // Deterministic dev secret — matches values in integration guides and .env.example files.
    // DO NOT use in production. Rotate via admin UI before deploying.
    const devClientSecret =
        'dev-secret-tcss460-do-not-use-in-prod-1234567890abcdef1234567890abcdef';
    await prisma.oAuthClient.upsert({
        where: { clientId: 'tcss460-dev-shared' },
        update: {
            clientSecret: devClientSecret,
            redirectUris: [
                'http://localhost:3000/api/auth/callback/tcss460',
                'http://localhost:3000/auth/callback',
            ],
        },
        create: {
            clientId: 'tcss460-dev-shared',
            clientSecret: devClientSecret,
            clientName: 'TCSS 460 Dev (Shared)',
            tenantId: 'tcss460-sp26',
            redirectUris: [
                'http://localhost:3000/api/auth/callback/tcss460',
                'http://localhost:3000/auth/callback',
            ],
        },
    });
    console.log(
        `  Created OAuth client: tcss460-dev-shared (secret: ${devClientSecret.substring(0, 8)}...)`
    );

    // Create AI Tutor OAuth client
    const aiTutorClientSecret =
        'dev-secret-ai-tutor-do-not-use-in-prod-1234567890abcdef1234567890abcdef';
    await prisma.oAuthClient.upsert({
        where: { clientId: 'ai-tutor-app' },
        update: {
            clientSecret: aiTutorClientSecret,
            redirectUris: [
                'http://localhost:3001/api/auth/callback/tcss460',
                'http://localhost:3001/api/auth/callback/auth2',
            ],
        },
        create: {
            clientId: 'ai-tutor-app',
            clientSecret: aiTutorClientSecret,
            clientName: 'AI Tutor Application',
            tenantId: 'ai-tutor',
            redirectUris: [
                'http://localhost:3001/api/auth/callback/tcss460',
                'http://localhost:3001/api/auth/callback/auth2',
            ],
        },
    });
    console.log(
        `  Created OAuth client: ai-tutor-app (secret: ${aiTutorClientSecret.substring(0, 8)}...)`
    );

    // Create tenant memberships for seed accounts
    // Owner gets Owner role in both tenants
    await prisma.tenantMembership.upsert({
        where: {
            accountId_tenantId: {
                accountId: owner.accountId,
                tenantId: 'tcss460-sp26',
            },
        },
        update: {},
        create: {
            accountId: owner.accountId,
            tenantId: 'tcss460-sp26',
            role: 5,
        },
    });
    await prisma.tenantMembership.upsert({
        where: {
            accountId_tenantId: {
                accountId: owner.accountId,
                tenantId: 'ai-tutor',
            },
        },
        update: {},
        create: { accountId: owner.accountId, tenantId: 'ai-tutor', role: 5 },
    });

    // Admin gets Admin role in TCSS 460
    await prisma.tenantMembership.upsert({
        where: {
            accountId_tenantId: {
                accountId: admin.accountId,
                tenantId: 'tcss460-sp26',
            },
        },
        update: {},
        create: {
            accountId: admin.accountId,
            tenantId: 'tcss460-sp26',
            role: 3,
        },
    });

    // Test user gets User role in TCSS 460
    await prisma.tenantMembership.upsert({
        where: {
            accountId_tenantId: {
                accountId: user.accountId,
                tenantId: 'tcss460-sp26',
            },
        },
        update: {},
        create: {
            accountId: user.accountId,
            tenantId: 'tcss460-sp26',
            role: 1,
        },
    });

    console.log('  Created tenant memberships for seed accounts');

    // ============================================================
    // v2 OAuth — API Resources + Consumer App Clients (Ring Topology)
    // ============================================================

    const NUM_GROUPS = 9;

    // Create 9 API Resources (one per student group's BE)
    const apiResources: { id: string; identifier: string }[] = [];
    for (let i = 1; i <= NUM_GROUPS; i++) {
        const resource = await prisma.apiResource.upsert({
            where: {
                tenantId_identifier: {
                    tenantId: 'tcss460-sp26',
                    identifier: `group-${i}-api`,
                },
            },
            update: {},
            create: {
                tenantId: 'tcss460-sp26',
                identifier: `group-${i}-api`,
                displayName: `Group ${i} API`,
            },
        });
        apiResources.push({ id: resource.id, identifier: resource.identifier });
    }
    console.log(`  Created ${NUM_GROUPS} API resources: group-1-api through group-${NUM_GROUPS}-api`);

    // Create 9 consumer-app OAuth clients (one per group's FE, Sprints 6-8)
    // Ring topology: Group N's consumer app calls group-(N-1)-api
    // Group 1's consumer → group-9-api, Group 2's consumer → group-1-api, etc.
    for (let i = 1; i <= NUM_GROUPS; i++) {
        const clientId = `group-${i}-consumer`;
        const clientSecret = `dev-secret-group-${i}-consumer-do-not-use-in-prod-${crypto.randomBytes(16).toString('hex')}`;

        await prisma.oAuthClient.upsert({
            where: { clientId },
            update: {
                redirectUris: [
                    'http://localhost:3000/api/auth/callback/tcss460',
                    'http://localhost:3000/auth/callback',
                ],
            },
            create: {
                clientId,
                clientSecret,
                clientName: `Group ${i} Consumer App`,
                tenantId: 'tcss460-sp26',
                redirectUris: [
                    'http://localhost:3000/api/auth/callback/tcss460',
                    'http://localhost:3000/auth/callback',
                ],
            },
        });

        // Ring: Group N's consumer is allowed audience group-(N-1)-api
        // Group 1 → group-9-api, Group 2 → group-1-api, ...
        const upstreamIndex = i === 1 ? NUM_GROUPS : i - 1;
        const upstreamResource = apiResources[upstreamIndex - 1]; // 0-indexed array

        // Upsert the allowed audience link
        await prisma.clientAllowedAudience.upsert({
            where: {
                clientId_apiResourceId: {
                    clientId,
                    apiResourceId: upstreamResource.id,
                },
            },
            update: {},
            create: {
                clientId,
                apiResourceId: upstreamResource.id,
            },
        });
    }
    console.log(
        `  Created ${NUM_GROUPS} consumer-app clients with ring-topology audience grants`
    );
    console.log(
        '  Ring: group-1-consumer → group-9-api, group-2-consumer → group-1-api, ...'
    );

    // Also grant the shared dev client access to all API resources (for instructor testing)
    for (const resource of apiResources) {
        await prisma.clientAllowedAudience.upsert({
            where: {
                clientId_apiResourceId: {
                    clientId: 'tcss460-dev-shared',
                    apiResourceId: resource.id,
                },
            },
            update: {},
            create: {
                clientId: 'tcss460-dev-shared',
                apiResourceId: resource.id,
            },
        });
    }
    console.log('  Granted tcss460-dev-shared access to all API resources (instructor testing)');

    console.log('Seeding complete!');
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error('Seed error:', e);
        await prisma.$disconnect();
        process.exit(1);
    });
