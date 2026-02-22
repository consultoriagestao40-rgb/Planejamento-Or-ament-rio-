import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken } from '@/lib/contaazul';
import { prisma } from '@/lib/prisma';

// Try to get company name/CNPJ from Conta Azul API
async function fetchCompanyInfo(accessToken: string): Promise<{ name: string; cnpj: string }> {
    const endpoints = [
        'https://api-v2.contaazul.com/v1/empresa',
        'https://api.contaazul.com/v1/empresa',
        'https://api-v2.contaazul.com/v1/tenants',
    ];
    for (const url of endpoints) {
        try {
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (res.ok) {
                const data = await res.json();
                const name = data.nome || data.name || data.razao_social || data[0]?.nome || 'Empresa';
                const cnpj = data.cnpj || data[0]?.cnpj || `unknown-${Date.now()}`;
                return { name, cnpj };
            }
        } catch (_) { }
    }
    return { name: 'Empresa Desconhecida', cnpj: `unknown-${Date.now()}` };
}

export async function GET(request: NextRequest) {
    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const { code, error } = searchParams;

    if (error) {
        return NextResponse.redirect(new URL(`/?error=${error}`, request.url));
    }

    if (!code) {
        return NextResponse.json({ error: 'No code provided' }, { status: 400 });
    }

    try {
        const tokenResponse = await exchangeCodeForToken(code as string);
        const { name, cnpj } = await fetchCompanyInfo(tokenResponse.access_token);

        // Upsert: if CNPJ already connected, refresh token; otherwise create new tenant
        const existing = await prisma.tenant.findFirst({ where: { cnpj } });

        if (existing) {
            await prisma.tenant.update({
                where: { id: existing.id },
                data: {
                    name,
                    accessToken: tokenResponse.access_token,
                    refreshToken: tokenResponse.refresh_token,
                    tokenExpiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000)
                }
            });
        } else {
            await prisma.tenant.create({
                data: {
                    name,
                    cnpj,
                    accessToken: tokenResponse.access_token,
                    refreshToken: tokenResponse.refresh_token,
                    tokenExpiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000)
                }
            });
        }

        return NextResponse.redirect(new URL('/?connected=true', request.url));
    } catch (err: any) {
        console.error("Callback Error:", err);
        return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(err.message)}`, request.url));
    }
}
