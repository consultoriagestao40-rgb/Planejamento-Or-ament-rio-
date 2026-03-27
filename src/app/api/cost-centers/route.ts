import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { v4 as uuidv4 } from 'uuid';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const tenantId = searchParams.get('tenantId');
        
        if (!tenantId) return NextResponse.json({ success: false, error: 'Tenant ID is required' }, { status: 400 });

        const costCenters = await prisma.costCenter.findMany({
            where: { tenantId },
            orderBy: { name: 'asc' }
        });

        return NextResponse.json({ success: true, costCenters });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, tenantId, customId } = body;

        if (!name || !tenantId) {
            return NextResponse.json({ success: false, error: 'Nome e Empresa são obrigatórios.' }, { status: 400 });
        }

        // v66.95: Inserção Manual de Centro de Custo com ID customizado ou gerado
        const newCC = await prisma.costCenter.create({
            data: {
                id: customId || uuidv4(),
                name: name.trim(),
                tenantId: tenantId
            }
        });

        return NextResponse.json({ success: true, costCenter: newCC });
    } catch (error: any) {
        if (error.code === 'P2002') {
            return NextResponse.json({ success: false, error: 'Este Centro de Custo já existe (ID ou Nome duplicado).' }, { status: 400 });
        }
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
