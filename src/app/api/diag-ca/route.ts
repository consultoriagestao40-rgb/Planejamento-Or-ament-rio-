import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const tenant = await prisma.tenant.findFirst({
            where: { name: { contains: 'JVS', mode: 'insensitive' } }
        });

        if (!tenant || !tenant.accessToken) {
            return NextResponse.json({ error: "JVS Tratamentos não possui Token válido salvo." });
        }

        const res = await fetch('https://api-v2.contaazul.com/v1/centros-de-custo?tamanho_pagina=100', {
            headers: { 'Authorization': `Bearer ${tenant.accessToken}` },
            cache: 'no-store'
        });

        if (!res.ok) {
            return NextResponse.json({ 
                error: "FALHA NA INTEGRAÇÃO - O Conta Azul recusou nossa Chave (Token). Você precisa Reconectar a JVS no botão azul do sistema.", 
                status_erro: res.status,
                detalhe_erro: await res.text() 
            });
        }

        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.itens || []);
        const target = items.filter((i: any) => (i.name || '').toUpperCase().includes('DIRETORIA'));

        return NextResponse.json({
            sucesso: true,
            mensagem_importante: "A conexão e chave da JVS estão Válidas e funcionando!",
            o_que_o_conta_azul_devolveu: target
        });

    } catch (e: any) {
        return NextResponse.json({ error: "Erro interno", detail: e.message });
    }
}
