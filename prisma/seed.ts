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
    console.log(`  Created pending user: ${pending.email} (status: ${pending.accountStatus})`);

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
