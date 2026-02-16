import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const prisma = new PrismaClient();

async function main() {
    console.log("Fetching categories...");
    const categories = await prisma.category.findMany({
        orderBy: { name: 'asc' }
    });

    console.log(`Found ${categories.length} categories.`);

    const sections = ['RECEITAS', 'DEDUCOES', 'CUSTOS', 'DESPESAS_COMERCIAIS', 'DESPESAS_ADMINISTRATIVAS', 'DESPESSAS_FINANCEIRAS'];

    // Group by section
    const bySection: Record<string, any[]> = {};
    const noSection: any[] = [];

    categories.forEach(c => {
        if (c.entradaDre) {
            if (!bySection[c.entradaDre]) bySection[c.entradaDre] = [];
            bySection[c.entradaDre].push(c);
        } else {
            noSection.push(c);
        }
    });

    console.log("\n--- DETAILED SECTION ANALYSIS ---");

    // 1. Where are the Revenues?
    console.log("\n### SEARCHING FOR REVENUE KEYWORDS (Venda, Receita, Faturamento)");
    const revenueKeywords = ['VENDA', 'RECEITA', 'FATURAMENTO'];
    categories.forEach(c => {
        const n = c.name.toUpperCase();
        if (revenueKeywords.some(k => n.includes(k))) {
            console.log(`  - [${c.entradaDre || 'NULL'}] ${c.name} (ID: ${c.id})`);
        }
    });

    // 2. What is in RECEITAS effectively?
    console.log("\n### CONTENTS OF 'RECEITAS' SECTION");
    if (bySection['RECEITAS']) {
        bySection['RECEITAS'].forEach(c => console.log(`  - ${c.name} (Parent: ${c.parentId})`));
    } else {
        console.log("  (Section is EMPTY)");
    }

    // 3. What is in DESPESSAS_FINANCEIRAS (Section 6)?
    console.log("\n### CONTENTS OF 'DESPESSAS_FINANCEIRAS' (Checking for non-financial items)");
    if (bySection['DESPESSAS_FINANCEIRAS']) {
        bySection['DESPESSAS_FINANCEIRAS'].forEach(c => {
            console.log(`  - ${c.name} (ID: ${c.id})`);
        });
    }

    // 4. Check for Orphans (Items that should have parents but don't seem to link up)
    console.log("\n### ORPHAN CHECK (Sample)");
    categories.slice(0, 10).forEach(c => {
        if (c.parentId) {
            const parent = categories.find(p => p.id === c.parentId);
            if (!parent) console.log(`  - BROKEN LINK: ${c.name} points to non-existent parent ${c.parentId}`);
        }
    });
}

main().catch(console.error);
