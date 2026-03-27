import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const year = 2026, month = 1;
    const entries = await prisma.budgetEntry.findMany({ 
      where: { year, month }, 
      include: { category: true } 
    });
    
    // Agrupamento para ver quem está "sujando" os 126k
    const report = entries.map(e => ({
      id: e.id,
      catName: e.category.name,
      catId: e.categoryId,
      amount: e.amount,
      tenant: e.tenantId,
      cc: e.costCenterId
    })).sort((a,b) => b.amount - a.amount);

    return NextResponse.json({ 
      success: true, 
      totalEntries: entries.length,
      revenueSum: entries.filter(e => e.category.name.match(/^[01]/)).reduce((acc,e)=>acc+e.amount, 0),
      taxesSum: entries.filter(e => e.category.name.match(/^0?2/)).reduce((acc,e)=>acc+e.amount, 0),
      data: report 
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
