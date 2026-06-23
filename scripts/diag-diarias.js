const { Client } = require('pg');

const DATABASE_URL = 'postgresql://postgres.ryfshgnyghzrqrsvjkyz:BudgetHub20250@sa-east-1.pooler.supabase.com:6543/postgres';

async function main() {
    const client = new Client({ connectionString: DATABASE_URL });
    await client.connect();

    console.log('\n=== DIAGNÓSTICO DE DIÁRIAS ===\n');

    // 1. Tenants existentes
    const tenants = await client.query('SELECT id, name, cnpj FROM "Tenant" ORDER BY name');
    console.log('--- TENANTS ---');
    tenants.rows.forEach(t => {
        const cnpj8 = (t.cnpj || '').replace(/\D/g, '').substring(0, 8);
        console.log(`  ${t.name} | id: ${t.id.substring(0,8)}... | cnpj8: ${cnpj8}`);
    });

    // 2. Categorias de Diárias (código 3.4 ou nome contendo diaria/diária)
    const cats = await client.query(`
        SELECT c.id, c.name, c."tenantId", t.name as tenant_name
        FROM "Category" c
        JOIN "Tenant" t ON t.id = c."tenantId"
        WHERE LOWER(c.name) LIKE '%di%ria%' OR c.name LIKE '%3.4%'
        ORDER BY c.name, t.name
    `);
    console.log('\n--- CATEGORIAS DE DIÁRIAS ---');
    cats.rows.forEach(c => {
        console.log(`  [${c.tenant_name}] ${c.name} | catId: ${c.id.substring(0,12)}...`);
    });

    // 3. Entradas realizadas de Diárias em 2026
    const realized = await client.query(`
        SELECT 
            r.month, r.amount, r."externalId", r."viewMode", r."costCenterId",
            c.name as cat_name, t.name as tenant_name,
            cc.name as cc_name
        FROM "RealizedEntry" r
        JOIN "Category" c ON c.id = r."categoryId"
        JOIN "Tenant" t ON t.id = r."tenantId"
        LEFT JOIN "CostCenter" cc ON cc.id = r."costCenterId"
        WHERE r.year = 2026
          AND (LOWER(c.name) LIKE '%di%ria%' OR c.name LIKE '%3.4%')
          AND r."viewMode" = 'competencia'
        ORDER BY r.month, t.name, cc.name
    `);
    console.log('\n--- REALIZADOS DE DIÁRIAS 2026 (competencia) ---');
    let totalByMonth = {};
    realized.rows.forEach(r => {
        const sync = r.externalId && r.externalId.startsWith('sync-') ? '[SYNC]' : '[MANUAL]';
        const cc = r.cc_name ? r.cc_name.substring(0, 30) : 'SEM CC';
        console.log(`  Mês ${r.month} | ${r.tenant_name} | ${cc} | R$${r.amount.toFixed(0)} ${sync} | ${r.cat_name}`);
        totalByMonth[r.month] = (totalByMonth[r.month] || 0) + r.amount;
    });
    console.log('\n  TOTAL POR MÊS (todos os tenants):');
    Object.keys(totalByMonth).sort((a,b) => +a-+b).forEach(m => {
        console.log(`  Mês ${m}: R$ ${totalByMonth[m].toFixed(0)}`);
    });

    // 4. Verificação de duplicação: mesma categoria, mesmo mês, tenants diferentes
    const dupCheck = await client.query(`
        SELECT 
            r.month, r.amount, 
            c.name as cat_name, t.name as tenant_name, t.cnpj,
            cc.name as cc_name,
            REGEXP_REPLACE(t.cnpj, '[^0-9]', '', 'g') as cnpj_clean
        FROM "RealizedEntry" r
        JOIN "Category" c ON c.id = r."categoryId"
        JOIN "Tenant" t ON t.id = r."tenantId"
        LEFT JOIN "CostCenter" cc ON cc.id = r."costCenterId"
        WHERE r.year = 2026
          AND (LOWER(c.name) LIKE '%di%ria%' OR c.name LIKE '%3.4%')
          AND r."viewMode" = 'competencia'
          AND r.month = 1
        ORDER BY cc.name, t.name
    `);
    console.log('\n--- DETALHE MÊS 1 (para detectar duplicata por CNPJ) ---');
    dupCheck.rows.forEach(r => {
        const cnpj8 = (r.cnpj_clean || '').substring(0, 8);
        const cc = r.cc_name ? r.cc_name.substring(0, 30) : 'SEM CC';
        console.log(`  [group:${cnpj8}] Tenant: ${r.tenant_name} | CC: ${cc} | R$${r.amount.toFixed(0)} | ${r.cat_name}`);
    });

    // 5. Budget de Diárias
    const budget = await client.query(`
        SELECT 
            b.month, b.amount,
            c.name as cat_name, t.name as tenant_name,
            cc.name as cc_name
        FROM "BudgetEntry" b
        JOIN "Category" c ON c.id = b."categoryId"
        JOIN "Tenant" t ON t.id = b."tenantId"
        LEFT JOIN "CostCenter" cc ON cc.id = b."costCenterId"
        WHERE b.year = 2026
          AND (LOWER(c.name) LIKE '%di%ria%' OR c.name LIKE '%3.4%')
          AND b.month = 1
        ORDER BY t.name, cc.name
    `);
    console.log('\n--- ORÇADO DIÁRIAS MÊS 1 ---');
    budget.rows.forEach(b => {
        const cc = b.cc_name ? b.cc_name.substring(0, 30) : 'SEM CC';
        console.log(`  Tenant: ${b.tenant_name} | CC: ${cc} | R$${b.amount.toFixed(0)} | ${b.cat_name}`);
    });

    await client.end();
}

main().catch(console.error);
