import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/services';

export async function GET() {
    try {
        const { token } = await getValidAccessToken();
        const res = await fetch('https://api-v2.contaazul.com/v1/centro-de-custo?tamanho_pagina=100', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        return NextResponse.json(data);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
