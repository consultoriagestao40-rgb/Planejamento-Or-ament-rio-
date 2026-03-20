import { prisma } from './prisma';
import { syncRealizedEntries } from './services';

/**
 * V47.10.3: Versão unificada do Cron Sync.
 * Agora utiliza a lógica robusta do services.ts para garantir precisão total.
 */
export async function runCronSync(reqYear: number, tenantId?: string) {
    const logs: string[] = [];
    const pushLog = (msg: string) => {
        console.log(msg);
        logs.push(msg);
    };

    const tenants = await prisma.tenant.findMany();
    const targets = tenantId ? tenants.filter(t => t.id === tenantId) : tenants;

    const report: any[] = [];

    for (const t of targets) {
        try {
            pushLog(`[SYNC] [${t.name}] Iniciando sincronização para o ano ${reqYear}...`);
            
            // Sincroniza Competência
            pushLog(`[SYNC] [${t.name}] Sincronizando Regime de Competência...`);
            const resComp = await syncRealizedEntries(t.id, reqYear, 'competencia');
            report.push({ tenant: t.name, mode: 'competencia', count: resComp.count });

            // Sincroniza Caixa
            pushLog(`[SYNC] [${t.name}] Sincronizando Regime de Caixa...`);
            const resCaixa = await syncRealizedEntries(t.id, reqYear, 'caixa');
            report.push({ tenant: t.name, mode: 'caixa', count: resCaixa.count });

            pushLog(`[SYNC] [${t.name}] Finalizado com sucesso.`);
        } catch (err: any) {
            pushLog(`[ERROR] [${t.name}] Falha na sincronização: ${err.message}`);
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
