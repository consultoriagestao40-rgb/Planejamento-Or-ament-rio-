import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const searchTerm = '271.204';
    const ccs = await prisma.costCenter.findMany({
      where: { name: { contains: searchTerm } }
    });

    const results = [];
    for (const cc of ccs) {
      const shortId = cc.id.includes(':') ? cc.id.split(':').pop() : cc.id;
      const budgets = await prisma.budgetEntry.findMany({
        where: { costCenterId: shortId },
      });
      results.push({
        name: cc.name,
        id: cc.id,
        tenantId: cc.tenantId,
        budgetCount: budgets.length,
        totalBudget: budgets.reduce((a, b) => a + (b.amount || 0), 0)
      });
    }

    return NextResponse.json({ success: true, data: results });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message });
  }
}
