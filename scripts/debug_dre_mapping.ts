import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const prisma = new PrismaClient();

async function main() {
    console.log("Fetching all categories...");
    const categories = await prisma.category.findMany({
        orderBy: { name: 'asc' }
    });

    console.log(`\n--- TOTAL CATEGORIES: ${categories.length} ---`);

    // 1. Check what is in RECEITAS
    const receitas = categories.filter(c => c.entradaDre === 'RECEITAS');
    console.log(`\n=== RECEITAS (${receitas.length} items) ===`);
    receitas.forEach(c => console.log(`[${c.id}] ${c.name} (Parent: ${c.parentId})`));

    // 2. Check what is in CUSTOS
    const custos = categories.filter(c => c.entradaDre === 'CUSTOS');
    console.log(`\n=== CUSTOS (${custos.length} items) ===`);
    custos.forEach(c => console.log(`[${c.id}] ${c.name} (Parent: ${c.parentId})`));

    // 3. Check what is in CUSTOS OPERACIONAIS (The user mentioned "Custos Operacionais" specifically)
    // My code uses 'CUSTOS' as the key for "Custos Operacionais" section.

    // 4. Check what is in DESPESAS_FINANCEIRAS
    const fin = categories.filter(c => c.entradaDre === 'DESPESSAS_FINANCEIRAS');
    console.log(`\n=== DESPESAS_FINANCEIRAS (${fin.length} items) ===`);
    fin.forEach(c => console.log(`[${c.id}] ${c.name}`));

    // 5. Look for "Lost" Operational/Revenue items
    console.log(`\n=== POTENTIAL REVENUE/COST ITEMS (Not in their sections) ===`);
    const potential = categories.filter(c => {
        const n = c.name.toUpperCase();
        const isRev = n.includes('RECEITA') || n.includes('VENDA') || n.includes('FATURAMENTO');
        const isCost = n.includes('CUSTO') || n.includes('PRODUCAO') || n.includes('MATERIA');
        return (isRev && c.entradaDre !== 'RECEITAS') || (isCost && c.entradaDre !== 'CUSTOS');
    });
    potential.forEach(c => console.log(`[${c.entradaDre || 'NULL'}] ${c.name}`));

    // 6. Check categories with 6.x or 1.x names to see where they went
    console.log(`\n=== NUMBERED CATEGORIES CHECK ===`);
    const numbered = categories.filter(c => c.name.startsWith('1.') || c.name.startsWith('6.'));
    // Show a sample
    numbered.slice(0, 20).forEach(c => console.log(`[${c.entradaDre || 'NULL'}] ${c.name}`));

}

main().catch(console.error).finally(() => prisma.$disconnect());
