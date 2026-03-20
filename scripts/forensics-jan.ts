import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log("🔍 [FORENSICS] Inspecting January 2026...");
    
    const entries = await prisma.realizedEntry.findMany({
        where: { year: 2026, month: 1 },
        include: { category: true, costCenter: true, tenant: true }
    });

    console.log(`✅ Found ${entries.length} entries.`);

    // 1. Total Revenue (Starts with 01)
    const revenue = entries.filter(e => e.category?.name?.startsWith('01'));
    const totalRev = revenue.reduce((acc, e) => acc + e.amount, 0);
    console.log(`💰 Total Revenue (01.*): R$ ${totalRev.toFixed(2)}`);

    // 2. Breakdown by Category
    const catBreakdown: Record<string, number> = {};
    revenue.forEach(e => {
        const key = `${e.category?.name} (${e.category?.id})`;
        catBreakdown[key] = (catBreakdown[key] || 0) + e.amount;
    });

    console.log("\n📊 [CATEGORY BREAKDOWN]");
    Object.entries(catBreakdown).sort((a,b) => b[1] - a[1]).forEach(([cat, sum]) => {
        console.log(` - ${cat}: R$ ${sum.toFixed(2)}`);
    });

    // 3. Look for the 22k remainder specifically
    const remainderCandidate = revenue.find(e => Math.abs(e.amount - 21469.17) < 1 || Math.abs(e.amount - 22519.90) < 1);
    if (remainderCandidate) {
        console.log(`\n🎯 FOUND REMAINDER ENTRY!`);
        console.log(JSON.stringify(remainderCandidate, null, 2));
    } else {
        console.log(`\n❌ Remainder entry (~R$ 22k) NOT FOUND in revenue categories.`);
        
        // Check ALL categories for this amount
        const anyCandidate = entries.find(e => Math.abs(e.amount - 21469.17) < 1 || Math.abs(e.amount - 22519.90) < 1);
        if (anyCandidate) {
            console.log(`\n⚠️ FOUND AMOUNT BUT IN NON-REVENUE CATEGORY!`);
            console.log(JSON.stringify(anyCandidate, null, 2));
        }
    }

    // 4. Check for Null Cost Centers
    const nullCC = revenue.filter(e => e.costCenterId === null);
    console.log(`\n⚪ Revenue entries with SEM CC: ${nullCC.length}`);
    console.log(`   Sum: R$ ${nullCC.reduce((acc, e) => acc + e.amount, 0).toFixed(2)}`);

}

main().catch(console.error).finally(() => prisma.$disconnect());
