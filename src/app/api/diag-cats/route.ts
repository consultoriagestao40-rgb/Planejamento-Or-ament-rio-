import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';

export async function GET() {
    try {
        const spot = await prisma.tenant.findFirst({ where: { name: { contains: 'SPOT' } } });
        if (!spot) return NextResponse.json({ error: "SPOT not found" });
        const { token } = await getValidAccessToken(spot.id);
        
        // API Categories
        const apiRes = await fetch(`https://api-v2.contaazul.com/v1/categorias?tamanho_pagina=100`, { headers: { 'Authorization': `Bearer ${token}` } });
        const apiCats = await apiRes.json();
        const apiList = Array.isArray(apiCats) ? apiCats : (apiCats.itens || []);
        
        // DB Categories
        const dbCats = await prisma.category.findMany({ where: { tenantId: spot.id } });
        
        return NextResponse.json({
            tenant: spot.name,
            apiCount: apiList.length,
            dbCount: dbCats.length,
            apiSample: apiList.slice(0, 10).map((c: any) => ({ id: c.id, name: c.name })),
            dbSample: dbCats.slice(0, 10).map((c: any) => ({ id: c.id, name: c.name }))
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
