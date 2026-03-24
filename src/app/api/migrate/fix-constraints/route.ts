import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        console.log("🛠️ Iniciando Faxina de Constraints (Versão Atômica)...");

        // 1. Descobrir o nome real da tabela (tentar RealizedEntry e realizedentry)
        const tables = await prisma.$queryRawUnsafe(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name ILIKE 'RealizedEntry';
        `) as any[];

        if (tables.length === 0) {
            return NextResponse.json({ success: false, error: "Tabela RealizedEntry não encontrada." });
        }

        const tableName = tables[0].table_name;
        console.log(`📍 Tabela identificada: ${tableName}`);

        // 2. Listar todas as constraints da tabela
        const constraints = await prisma.$queryRawUnsafe(`
            SELECT 
                conname as name, 
                pg_get_constraintdef(c.oid) as definition
            FROM pg_constraint c 
            JOIN pg_class t ON t.oid = c.conrelid
            WHERE t.relname = $1;
        `, tableName) as any[];

        const results: string[] = [];
        
        // 3. Procurar a constraint que agrupa os campos de competência
        // No erro: ('tenantId', 'categoryId', 'costCenterId', 'month', 'year', 'viewMode')
        for (const c of constraints) {
            const def = c.definition.toLowerCase();
            const isTarget = (
                def.includes('unique') && 
                def.includes('tenantid') && 
                def.includes('categoryid') && 
                def.includes('month') && 
                def.includes('year')
            );

            if (isTarget) {
                console.log(`🗑️ Removendo constraint detectada: ${c.name} (${c.definition})`);
                await prisma.$executeRawUnsafe(`ALTER TABLE "${tableName}" DROP CONSTRAINT "${c.name}"`);
                results.push(`Constraint: ${c.name}`);
            }
        }

        // 4. Procurar ÍNDICES ÚNICOS que não são constraints
        const indexes = await prisma.$queryRawUnsafe(`
            SELECT
                i.relname AS index_name,
                pg_get_indexdef(idx.indexrelid) as definition
            FROM
                pg_index AS idx
            JOIN
                pg_class AS t ON t.oid = idx.indrelid
            JOIN
                pg_class AS i ON i.oid = idx.indexrelid
            WHERE
                t.relname = $1
                AND idx.indisunique = true
                AND i.relname NOT LIKE '%_pkey';
        `, tableName) as any[];

        for (const idx of indexes) {
            const def = idx.definition.toLowerCase();
            const isTarget = (
                def.includes('unique') && 
                def.includes('tenantid') && 
                def.includes('categoryid') && 
                def.includes('month') && 
                def.includes('year')
            );

            if (isTarget) {
                console.log(`🗑️ Removendo índice detectado: ${idx.index_name}`);
                await prisma.$executeRawUnsafe(`DROP INDEX "${idx.index_name}"`);
                results.push(`Index: ${idx.index_name}`);
            }
        }

        return NextResponse.json({ 
            success: true, 
            tableName,
            removed: results,
            allConstraints: constraints.map(c => `${c.name}: ${c.definition}`),
            allUniqueIndexes: indexes.map(i => `${i.index_name}: ${i.definition}`),
            message: results.length > 0 ? "Trava conflitante removida!" : "Nenhuma trava encontrada com esse padrão."
        });

    } catch (error: any) {
        console.error("❌ Erro fatal na faxina:", error);
        return NextResponse.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
}
