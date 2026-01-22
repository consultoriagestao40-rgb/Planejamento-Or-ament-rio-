import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken } from '@/lib/contaazul';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');

    if (!code) {
        return NextResponse.json({ error: 'Missing code' }, { status: 400 });
    }

    try {
        const tokenData = await exchangeCodeForToken(code);

        // For prototype: We don't have an endpoint to get "My Company Info" easily documented.
        // We will generate a unique placeholder for this tenant.
        // In a real app, we might ask the user to confirm the CNPJ or fetch it from a setup screen.
        const tempId = Math.random().toString(36).substring(7).toUpperCase();

        // Upsert a Tenant (In reality, we should try to identify if it exists, but for now create new)
        const tenant = await prisma.tenant.create({
            data: {
                name: `Empresa Conectada (${tempId})`,
                cnpj: `TEMP-${tempId}`, // Placeholder CNPJ
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token,
                tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
            }
        });

        console.log('Tenant Created:', tenant.id);

        // DEBUGGING: Show raw JSON instead of redirecting
        return NextResponse.json({
            status: 'SUCCESS',
            message: 'Tenant created successfully',
            tenantId: tenant.id,
            tokenExpires: tenant.tokenExpiresAt
        });
    } catch (error: any) {
        console.error('Auth Error:', error);
        return NextResponse.json({
            status: 'ERROR',
            message: error instanceof Error ? error.message : 'Unknown auth error',
            details: JSON.stringify(error)
        }, { status: 500 });
    }
}
