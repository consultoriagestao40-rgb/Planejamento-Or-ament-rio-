import { prisma } from './prisma';
import { syncRealizedEntries, syncMasterData } from './services';

/**
 * Orquestrador do Cron Sync com suporte a intervalo de meses.
 * Proteção: nunca apaga dados do Excel (externalId sem prefixo 'sync-').
 */
export async function runCronSync(
    reqYear: number,
    tenantId?: string,
    startMonth: number = 1,
    endMonth: number = 12
) {
    const logs: string[] = [];
    const pushLog = (msg: string) => {
        const timestamped = `[${new Date().toLocaleTimeString()}] ${msg}`;
        console.log(timestamped);
        logs.push(timestamped);
    };

    pushLog(`[SYNC] Iniciando sync — Ano: ${reqYear}, Meses: ${startMonth}→${endMonth}`);

    const tenants = await prisma.tenant.findMany();
    const targets = tenantId ? tenants.filter(t => t.id === tenantId) : tenants;

    const report: any[] = [];

    for (const t of targets) {
        try {
            pushLog(`[SYNC] [${t.name}] Iniciando...`);

            // Sincroniza Metadados (Categorias e Centros de Custo)
            pushLog(`[SYNC] [${t.name}] Sincronizando estrutura (Categorias/CCs)...`);
            await syncMasterData(t.id);

            // Sincroniza Competência — apenas meses solicitados
            pushLog(`[SYNC] [${t.name}] Sincronizando Competência (meses ${startMonth}→${endMonth})...`);
            const resComp = await syncRealizedEntries(t.id, reqYear, 'competencia', startMonth, endMonth);
            pushLog(`[SYNC] [${t.name}] Competência: ${resComp.count} registros.`);
            report.push({ tenant: t.name, mode: 'competencia', count: resComp.count, months: resComp.months });

            // Sincroniza Caixa — apenas meses solicitados
            pushLog(`[SYNC] [${t.name}] Sincronizando Caixa (meses ${startMonth}→${endMonth})...`);
            const resCaixa = await syncRealizedEntries(t.id, reqYear, 'caixa', startMonth, endMonth);
            pushLog(`[SYNC] [${t.name}] Caixa: ${resCaixa.count} registros.`);
            report.push({ tenant: t.name, mode: 'caixa', count: resCaixa.count, months: resCaixa.months });

            pushLog(`[SYNC] [${t.name}] ✅ Concluído.`);
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
        timestamp: new Date().toISOString(),
        protection: `Dados do Excel (Jan→${String(startMonth - 1).padStart(2, '0')}) preservados — nunca sobrescritos`
    };
}
