import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const spot = await prisma.tenant.findFirst({ where: { name: { contains: 'SPOT' } } });
        if (!spot) return NextResponse.json({ error: 'SPOT not found' });

        const { token } = await getValidAccessToken(spot.id);
        // Buscar especificamente a Venda 657 para entender o JSON
        const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=2026-01-01&data_vencimento_ate=2026-01-31`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        
        const item657 = (data.itens || []).find((i: any) => i.descricao.includes('657'));
        const item643 = (data.itens || []).find((i: any) => i.descricao.includes('643'));

        return NextResponse.json({
            debug: {
                item657,
                item643
            },
            all_descriptions: (data.itens || []).map((i: any) => `${i.descricao} | Valor: ${i.valor} | Pago: ${i.pago} | Cats: ${i.categorias?.length}`)
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
