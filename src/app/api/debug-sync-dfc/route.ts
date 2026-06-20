import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { syncBankAccounts, syncOpenCommitments, getValidAccessToken } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const logs: string[] = [];
    const pushLog = (msg: string) => {
        const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
        console.log(line);
        logs.push(line);
    };

    try {
        const { searchParams } = new URL(request.url);
        // Default to JVS Tratmentos / Facilities
        const tenantId = searchParams.get('tenantId') || 'dc2b6eed-a38a-43c3-9465-ce854bfda90f'; 
        
        pushLog(`[Debug Sync] Buscando tenant ${tenantId}`);
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        if (!tenant) {
            pushLog(`[Debug Sync] Tenant não encontrado!`);
            return NextResponse.json({ success: false, error: 'Tenant não encontrado', logs });
        }
        pushLog(`[Debug Sync] Tenant encontrado: ${tenant.name}`);

        pushLog(`[Debug Sync] Obtendo token de acesso...`);
        const { token } = await getValidAccessToken(tenantId);
        pushLog(`[Debug Sync] Token obtido com sucesso (comprimento: ${token?.length})`);

        pushLog(`[Debug Sync] Chamando syncBankAccounts...`);
        try {
            await syncBankAccounts(tenantId, token);
            pushLog(`[Debug Sync] syncBankAccounts concluído.`);
        } catch (e: any) {
            pushLog(`[Debug Sync] FALHA em syncBankAccounts: ${e.message}\nStack: ${e.stack}`);
        }

        pushLog(`[Debug Sync] Chamando syncOpenCommitments...`);
        try {
            await syncOpenCommitments(tenantId, token, 2026);
            pushLog(`[Debug Sync] syncOpenCommitments concluído.`);
        } catch (e: any) {
            pushLog(`[Debug Sync] FALHA em syncOpenCommitments: ${e.message}\nStack: ${e.stack}`);
        }

        // Verificações finais no DB
        const countAccounts = await prisma.bankAccount.count({ where: { tenantId } });
        const countCommitments = await prisma.realizedEntry.count({
            where: { tenantId, viewMode: { in: ['previsto_receber', 'previsto_pagar'] } }
        });

        pushLog(`[Debug Sync] Verificação final: Encontradas ${countAccounts} contas bancárias e ${countCommitments} títulos previstos no banco.`);

        return NextResponse.json({
            success: true,
            logs,
            countAccounts,
            countCommitments
        });

    } catch (e: any) {
        pushLog(`[Debug Sync] CRITICAL ERROR: ${e.message}\nStack: ${e.stack}`);
        return NextResponse.json({ success: false, error: e.message, logs }, { status: 500 });
    }
}
