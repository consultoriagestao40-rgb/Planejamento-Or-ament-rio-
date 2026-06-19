import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany({
            select: { id: true, name: true }
        });

        const cleanTech = tenants.find(t => t.name.toUpperCase().includes('CLEAN TECH'));
        if (!cleanTech) {
            return NextResponse.json({ success: false, error: 'Clean Tech not found' });
        }

        const { token } = await getValidAccessToken(cleanTech.id);

        // Fetch category name
        const catId = '6895488a-e4ff-45c8-b29e-369e0da037cc';
        const catFromDb = await prisma.category.findFirst({
            where: {
                id: {
                    contains: catId
                }
            }
        });

        // Fetch receivables to find Venda 619
        const recUrl = "https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-12-31&data_competencia_de=2026-05-01&data_competencia_ate=2026-05-31&tamanho_pagina=100";
        const recRes = await fetch(recUrl, {
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-store'
        });

        const recData = await recRes.json();
        const recs = recData.itens || [];
        const venda619 = recs.find((r: any) => r.descricao.includes('619'));

        return NextResponse.json({
            success: true,
            categoryFromDb: catFromDb,
            venda619
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
