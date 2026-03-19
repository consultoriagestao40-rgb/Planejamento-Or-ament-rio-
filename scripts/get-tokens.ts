
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    const tenants = await (prisma as any).tenant.findMany({
        select: { id: true, name: true, accessToken: true }
    });
    console.log(JSON.stringify(tenants, null, 2));
}
run();
