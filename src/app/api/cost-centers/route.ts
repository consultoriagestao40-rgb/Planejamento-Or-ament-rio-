import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

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

        // v66.96: Inserção Manual de Centro de Custo com ID customizado ou gerado via crypto nativo
        const newCC = await prisma.costCenter.create({
            data: {
                id: customId || crypto.randomUUID(),
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

export async function PUT(request: Request) {
    try {
        const body = await request.json();
        const { id, name, tenantId, inativar } = body;

        if (!id || !tenantId) return NextResponse.json({ success: false, error: 'ID e Empresa obrigatórios.' }, { status: 400 });

        let finalName = name;
        
        // Se a instrução direta for inativar/ativar de forma magica via botao "Olho"
        if (inativar === true) {
            const cc = await prisma.costCenter.findUnique({ where: { id } });
            if (!cc) return NextResponse.json({ success: false, error: 'CC não encontrado' }, { status: 404 });
            
            if (cc.name.toUpperCase().includes('[INATIVO]')) {
                finalName = cc.name.replace(/\[INATIVO\]\s*/i, '').trim();
            } else {
                finalName = `[INATIVO] ${cc.name}`;
            }
        }

        if (!finalName) return NextResponse.json({ success: false, error: 'Nome vazio' }, { status: 400 });

        const updatedCC = await prisma.costCenter.update({
            where: { id },
            data: { name: finalName.trim() }
        });

        return NextResponse.json({ success: true, costCenter: updatedCC });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const body = await request.json();
        const { id, tenantId } = body;

        if (!id || !tenantId) return NextResponse.json({ success: false, error: 'ID e Empresa obrigatórios.' }, { status: 400 });

        // Prisma Transaction for Cascading Hard Delete
        await prisma.$transaction([
            prisma.budgetEntry.deleteMany({ where: { costCenterId: id, tenantId } }),
            prisma.realizedEntry.deleteMany({ where: { costCenterId: id, tenantId } }),
            prisma.costCenterLock.deleteMany({ where: { costCenterId: id, tenantId } }),
            prisma.userCostCenterAccess.deleteMany({ where: { costCenterId: id } }),
            prisma.costCenter.delete({ where: { id, tenantId } })
        ]);

        return NextResponse.json({ success: true, message: 'Centro de Custo e todo seu histórico deletados com sucesso.' });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
