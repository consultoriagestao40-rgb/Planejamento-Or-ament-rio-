const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Let's load the categories and their realized / budgeted entries
    const categories = await prisma.category.findMany({
        where: { type: 'REVENUE' }
    });
    console.log(`Found ${categories.length} revenue categories.`);

    const realized = await prisma.realizedEntry.findMany({
        where: { year: 2026 }
    });

    const budgets = await prisma.budgetEntry.findMany({
        where: { year: 2026 }
    });

    // Let's compute monthly revenue totals
    const monthlyTotals = Array.from({ length: 12 }, () => ({ b: 0, r: 0 }));

    // Helper to check if a category is a revenue root category
    // Let's look at root categories (parentId = null or code starts with 01/1)
    const revCatIds = new Set(categories.map(c => c.id));

    budgets.forEach(entry => {
        if (revCatIds.has(entry.categoryId)) {
            // Check if it's a root category or we need to only sum roots to avoid double counting
            // In the frontend: sumRoots(buckets.rev, monthIdx, 'budget')
            // Let's check which categories are root categories (parentId = null)
        }
    });

    // Let's just print a summary of all categories and their realized values for each month
    console.log("Monthly Realized Entries for 2026:");
    for (let m = 0; m < 12; m++) {
        let sumB = 0;
        let sumR = 0;
        // Let's find categories that are root (parentId === null)
        const roots = categories.filter(c => !c.parentId);
        roots.forEach(root => {
            // Find all descendants of this root (including root itself)
            const descendants = getDescendants(root.id, categories);
            const descIds = new Set(descendants.map(d => d.id));
            descIds.add(root.id);

            // Sum budgets and realized for these categories for month m
            const monthBudgets = budgets.filter(b => descIds.has(b.categoryId) && b.month === (m + 1));
            const monthRealized = realized.filter(r => descIds.has(r.categoryId) && r.month === (m + 1));

            // Wait, to avoid double counting, we should only sum leaf categories or only sum roots
            // Let's see how they calculate it in calculateNode.
        });
    }
}

function getDescendants(parentId, allCats) {
    const list = [];
    const children = allCats.filter(c => c.parentId === parentId);
    list.push(...children);
    children.forEach(c => {
        list.push(...getDescendants(c.id, allCats));
    });
    return list;
}

// Let's do a simpler query: just print the total of all realized entries where type is REVENUE or categoryId is a revenue category
async function runSimple() {
    const categories = await prisma.category.findMany();
    const revCats = categories.filter(c => {
        const code = c.code || '';
        return code.startsWith('01') || code === '1' || c.type === 'REVENUE';
    });
    const revCatIds = new Set(revCats.map(c => c.id));
    console.log("Revenue categories:", revCats.map(c => `${c.code} - ${c.name} (${c.id})`));

    const realized = await prisma.realizedEntry.findMany({
        where: { year: 2026 }
    });
    const budgets = await prisma.budgetEntry.findMany({
        where: { year: 2026 }
    });

    console.log("\nRevenue monthly totals (summing only root categories to avoid double counting):");
    const roots = revCats.filter(c => !c.parentId || !revCatIds.has(c.parentId));
    console.log("Root revenue categories:", roots.map(c => c.name));

    for (let m = 0; m < 12; m++) {
        let rSum = 0;
        let bSum = 0;
        roots.forEach(root => {
            // Sum realized and budget for this root
            // Wait, does calculateNode sum values recursively? Yes:
            // "totalsMap.set(node.id, { budget: myBudget, realized: myRealized })"
            // Let's just find the values directly.
            // Let's see how much realized is registered under root categories or their descendants.
            const desc = getDescendants(root.id, categories);
            const descIds = new Set(desc.map(d => d.id));
            descIds.add(root.id);

            // Sum only leaf nodes or sum roots?
            // If we sum all realized entries for descIds, is it double counted?
            // In the DB, realized values are stored per category. If they are stored on leaf categories, summing them is correct.
            // Let's print the sum of entries for each month.
            const rEntries = realized.filter(r => descIds.has(r.categoryId) && r.month === (m + 1));
            const bEntries = budgets.filter(b => descIds.has(b.categoryId) && b.month === (m + 1));
            
            // To avoid double counting, let's sum only leaf categories (categories that have no children in the descIds)
            const leaves = Array.from(descIds).filter(id => !categories.some(c => c.parentId === id));
            const leafIds = new Set(leaves.length > 0 ? leaves : [root.id]);

            rEntries.forEach(r => {
                if (leafIds.has(r.categoryId)) rSum += r.amount || 0;
            });
            bEntries.forEach(b => {
                if (leafIds.has(b.categoryId)) bSum += b.amount || 0;
            });
        });
        console.log(`Month ${m + 1}: Budget = ${bSum.toFixed(2)}, Realized = ${rSum.toFixed(2)}`);
    }
}

runSimple().finally(() => prisma.$disconnect());
