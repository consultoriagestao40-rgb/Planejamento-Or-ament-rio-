import fs from 'fs';
import path from 'path';

// Injetar variáveis de ambiente manualmente
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

import { runCronSync } from '../src/lib/cronSync';

async function main() {
    console.log('Iniciando sincronização local para Junho/2026 com correção de baixas aplicada...');
    const result = await runCronSync(2026, 'all', 6, 6);
    console.log('Resultado do Sync:', JSON.stringify(result, null, 2));
}

main();
