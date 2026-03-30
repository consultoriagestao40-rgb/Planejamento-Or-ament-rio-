import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        console.log("=== INICIANDO RESGATE DO TOKEN DE JVS TRATAMENTOS ===");

        // Encontrar a 'Empresa Desconhecida' recém-criada (a que tem o token válido)
        const unknownTenant = await prisma.tenant.findFirst({
            where: { name: 'Empresa Desconhecida' },
            orderBy: { createdAt: 'desc' }
        });

        if (!unknownTenant || !unknownTenant.accessToken) {
             return NextResponse.json({ error: "Empresa Desconhecida com Token não encontrada. Talvez vc já excluiu ela?" });
        }

        // Encontrar a JVS original
        const jvsTenant = await prisma.tenant.findFirst({
            where: { name: { contains: 'JVS TRATMENTOS', mode: 'insensitive' } }
        });

        if (!jvsTenant) {
             return NextResponse.json({ error: "JVS Tratamentos não encontrada no Banco." });
        }

        // Copiar os dados válidos pra JVS
        await prisma.tenant.update({
            where: { id: jvsTenant.id },
            data: {
                accessToken: unknownTenant.accessToken,
                refreshToken: unknownTenant.refreshToken,
                tokenExpiresAt: unknownTenant.tokenExpiresAt
            }
        });

        // Mudar o ID base do CCs e Despesas que a Empresa Desconhecida tenha sincronizado por acidente
        await prisma.costCenter.updateMany({ where: { tenantId: unknownTenant.id }, data: { tenantId: jvsTenant.id } });
        await prisma.category.updateMany({ where: { tenantId: unknownTenant.id }, data: { tenantId: jvsTenant.id } });
        await prisma.realizedEntry.updateMany({ where: { tenantId: unknownTenant.id }, data: { tenantId: jvsTenant.id } });

        // Excluir a Empresa Clone fantasma
        await prisma.tenant.delete({
            where: { id: unknownTenant.id }
        });

        return NextResponse.json({ 
            sucesso: true, 
            mensagem: "✅ RESGATE FEITO! O Token da Empresa Desconhecida foi devolvido para a JVS Tratamentos e a Empresa Desconhecida foi excluída. Volte na tela de Sincronizar agora!" 
        });

    } catch (e: any) {
        return NextResponse.json({ sucesso: false, erro: e.message });
    }
}
