import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: Request) {
    const url = new URL(request.url);
    const tenantId = '413f88a7-ce4a-4620-b044-43ef909b7b26'; // SPOT
    
    try {
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        if (!tenant || !tenant.accessToken) return NextResponse.json({ error: 'Tenant not found' });

        const year = 2026;
        const startDate = `${year}-01-01`;
        const endDate = `${year}-01-31`;

        const res = await fetch(`https://api.contaazul.com/v1/sales?status=REALIZED&emission_date_start=${startDate}&emission_date_end=${endDate}`, {
            headers: { 'Authorization': `Bearer ${tenant.accessToken}` }
        });
        
        const data = await res.json();
        const isArray = Array.isArray(data);

        return NextResponse.json({
            success: true,
            status: res.status,
            isArray,
            count: isArray ? data.length : 0,
            sample: isArray ? data.slice(0, 3) : null,
            raw: data
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message });
    } finally {
        await prisma.$disconnect();
    }
}
