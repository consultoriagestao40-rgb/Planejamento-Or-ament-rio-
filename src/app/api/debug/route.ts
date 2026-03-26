import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        const start = Date.now();
        const tenantCount = await prisma.tenant.count();
        const end = Date.now();
        
        return NextResponse.json({ 
            success: true, 
            message: "Database is reachable",
            tenantCount,
            responseTime: `${end - start}ms`
        });
    } catch (error: any) {
        return NextResponse.json({ 
            success: false, 
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
}
