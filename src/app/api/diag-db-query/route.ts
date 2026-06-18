import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function decodeJwt(token: string | null) {
    if (!token) return null;
    try {
        const parts = token.split('.');
        if (parts.length < 2) return null;
        const payload = Buffer.from(parts[1], 'base64').toString('utf8');
        return JSON.parse(payload);
    } catch (e) {
        return null;
    }
}

export async function GET() {
    try {
        const tenants = await prisma.tenant.findMany();
        const results = tenants.map(t => {
            const decoded = decodeJwt(t.accessToken);
            return {
                id: t.id,
                name: t.name,
                cnpj: t.cnpj,
                username: decoded ? decoded.username : null,
                client_id: decoded ? decoded.client_id : null
            };
        });
        return NextResponse.json({ success: true, results });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
