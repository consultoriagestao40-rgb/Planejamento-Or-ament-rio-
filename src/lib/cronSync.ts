import { prisma } from './prisma';
import { syncRealizedEntries } from './services';

/**
 * V47.10.4: Orquestrador do Cron Sync com logs detalhados.
 */
export async function runCronSync(reqYear: number, tenantId?: string) {
    const logs: string[] = [];
    const pushLog = (msg: string) => {
        const timestamped = `[${new Date().toLocaleTimeString()}] ${msg}`;
        console.log(timestamped);
        logs.push(timestamped);
    };

    const tenants = await prisma.tenant.findMany();
    const targets = tenantId ? tenants.filter(t => t.id === tenantId) : tenants;

    const report: any[] = [];

    for (const t of targets) {
        try {
            pushLog(`[SYNC] [${t.name}] Iniciando sincronização (Ano: ${reqYear})...`);
            
            // Sincroniza Competência
            pushLog(`[SYNC] [${t.name}] Sincronizando Competência...`);
            const resComp = await syncRealizedEntries(t.id, reqYear, 'competencia');
            pushLog(`[SYNC] [${t.name}] Competência: Encontrados ${resComp.count} registros.`);
            report.push({ tenant: t.name, mode: 'competencia', count: resComp.count });

            // Sincroniza Caixa
            pushLog(`[SYNC] [${t.name}] Sincronizando Caixa...`);
            const resCaixa = await syncRealizedEntries(t.id, reqYear, 'caixa');
            pushLog(`[SYNC] [${t.name}] Caixa: Encontrados ${resCaixa.count} registros.`);
            report.push({ tenant: t.name, mode: 'caixa', count: resCaixa.count });

            pushLog(`[SYNC] [${t.name}] Sucesso.`);
        } catch (err: any) {
            const errorMsg = `[ERROR] [${t.name}] ${err.message}`;
            pushLog(errorMsg);
            report.push({ tenant: t.name, error: err.message });
        }
    }

    return { 
        success: true,
        report, 
        logs,
        timestamp: new Date().toISOString()
    };
}
