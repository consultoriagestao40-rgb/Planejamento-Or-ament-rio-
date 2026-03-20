const { Client } = require('pg');

const DATABASE_URL = 'postgresql://postgres.ryfshgnyghzrqrsvjkyz:BudgetHub20250@sa-east-1.pooler.supabase.com:6543/postgres';

async function main() {
    const client = new Client({ connectionString: DATABASE_URL });
    try {
        await client.connect();
        console.log('Conectado ao banco de dados.');

        const res = await client.query('SELECT id, name, "tenantId" FROM "Category" LIMIT 10');
        console.log('\n--- AMOSTRA DE CATEGORIAS ---');
        res.rows.forEach(r => {
            console.log(`ID: ${r.id} | Name: ${r.name} | Tenant: ${r.tenantId}`);
        });

        const res2 = await client.query('SELECT DISTINCT "categoryId" FROM "RealizedEntry" WHERE year = 2026 LIMIT 10');
        console.log('\n--- AMOSTRA DE IDs EM RealizedEntry (2026) ---');
        res2.rows.forEach(r => {
            console.log(`ID na Tabela Realized: ${r.categoryId}`);
        });

        const res3 = await client.query('SELECT count(*) FROM "RealizedEntry" WHERE year = 2026');
        console.log(`\nTotal de RealizedEntry em 2026: ${res3.rows[0].count}`);

    } catch (err) {
        console.error('Erro ao conectar ou consultar:', err.message);
    } finally {
        await client.end();
    }
}

main();
