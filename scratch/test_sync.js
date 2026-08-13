const fs = require('fs');
const path = require('path');

try {
    const envPath = path.join(__dirname, '../.env.development.local');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const parts = trimmed.split('=');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const val = parts.slice(1).join('=').trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
                    process.env[key] = val;
                }
            }
        });
    }
} catch (e) {
    console.error('Erro ao ler env:', e);
}

const { syncRealizedEntries } = require('../src/lib/services');

async function main() {
    const tenantId = '0013c839-93bb-472d-ba64-092c89e1cacf'; // JVS TRATAMENTOS
    console.log(`Rodando syncRealizedEntries para JVS TRATAMENTOS (Junho 2026)...`);
    try {
        const resultCaixa = await syncRealizedEntries(tenantId, 2026, 'caixa', 6, 6);
        console.log('Resultado Caixa:', JSON.stringify(resultCaixa, null, 2));

        const resultComp = await syncRealizedEntries(tenantId, 2026, 'competencia', 6, 6);
        console.log('Resultado Competência:', JSON.stringify(resultComp, null, 2));
    } catch (e) {
        console.error('Erro no sync:', e);
    }
}

main();
