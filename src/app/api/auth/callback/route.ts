import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken } from '@/lib/contaazul';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const { code, state, error } = searchParams;

    if (error) {
        return NextResponse.redirect(new URL(`/?error=${error}`, request.url));
    }

    if (!code) {
        return NextResponse.json({ error: 'No code provided' }, { status: 400 });
    }

    try {
        // 1. Troca o código pelo token
        const tokenResponse = await exchangeCodeForToken(code as string);

        // 2. Salva no banco (Atualiza o primeiro Tenant encontrado ou cria um)
        // Como é protótipo, vamos assumir single-tenant
        let tenant = await prisma.tenant.findFirst();

        if (tenant) {
            await prisma.tenant.update({
                where: { id: tenant.id },
                data: {
                    accessToken: tokenResponse.access_token,
                    refreshToken: tokenResponse.refresh_token,
                    tokenExpiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000)
                }
            });
        } else {
            // Se não tem tenant, cria um (Cenário de first run)
            await prisma.tenant.create({
                data: {
                    name: "Minha Empresa (Conta Azul)",
                    cnpj: "00000000000000", // Placeholder
                    accessToken: tokenResponse.access_token,
                    refreshToken: tokenResponse.refresh_token,
                    tokenExpiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000)
                }
            });
        }

        // 3. Redireciona de volta para a Home com sucesso
        return NextResponse.redirect(new URL('/?connected=true', request.url));

    } catch (err: any) {
        console.error("Callback Error:", err);
        return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(err.message)}`, request.url));
    }
}
