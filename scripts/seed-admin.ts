import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const email = 'admin@budgethub.com';
    const password = process.argv[2] || 'admin123'; // Accept password from args or default

    const existingAdmin = await prisma.user.findUnique({ where: { email } });

    if (existingAdmin) {
        console.log(`Admin user ${email} already exists.`);
        process.exit(0);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const admin = await prisma.user.create({
        data: {
            name: 'System Admin',
            email,
            passwordHash,
            role: 'MASTER',
        }
    });

    console.log(`Successfully created admin user: ${admin.email} / ${password}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
