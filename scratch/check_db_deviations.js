const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        console.log("Checking User columns...");
        const users = await prisma.user.findMany({ take: 1 });
        console.log("User works:", users);
    } catch (e) {
        console.error("User failed:", e.message);
    }

    try {
        console.log("Checking DeviationAnalysis table...");
        const count = await prisma.deviationAnalysis.count();
        console.log("DeviationAnalysis count:", count);
        
        const all = await prisma.deviationAnalysis.findMany({ take: 10 });
        console.log("DeviationAnalysis items:", all);
    } catch (e) {
        console.error("DeviationAnalysis failed:", e.message);
    }
}

main().then(() => prisma.$disconnect());
