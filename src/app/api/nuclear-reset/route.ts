import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        const targetNames = ['CLEAN TECH', 'CLEANTECH', 'CLEAN TECH - ADMINISTRATIVO'];
        const ccs = await prisma.costCenter.findMany({
            where: {
                OR: targetNames.map(name => ({ name: { contains: name, mode: 'insensitive' } }))
            }
        });
        const ccIds = ccs.map(cc => cc.id);
        
        const deleted = await prisma.budgetEntry.deleteMany({
            where: {
                costCenterId: { in: ccIds },
                year: 2026
            }
        });

        return NextResponse.json({ 
            success: true, 
            message: `Limpeza concluída! ${deleted.count} registros fantasmas foram apagados para a Clean Tech.`,
            clearedIds: ccIds
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message });
    }
}
