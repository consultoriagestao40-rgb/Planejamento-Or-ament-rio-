import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/services';

export async function GET(request: Request) {
    try {
        const accessToken = await getValidAccessToken();

        const url = `https://api-v2.contaazul.com/v1/centro-de-custo?pagina=1&tamanho_pagina=100`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });

        if (!res.ok) {
            return NextResponse.json({ success: false, error: `Conta Azul API replied with ${res.status}` }, { status: 500 });
        }

        const data = await res.json();

        // Return exactly what Conta Azul returned so we can inspect the properties 
        // that define whether a cost center is ACTIVE or INACTIVE
        return NextResponse.json({
            success: true,
            message: "Por favor, copie o JSON abaixo (especialmente os items inativos como BALNEÁRIO) e envie para o programador:",
            rawData: data
        });

    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
