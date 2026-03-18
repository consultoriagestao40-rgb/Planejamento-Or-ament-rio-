import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const year = 2026;
    const month = 1; // Janeiro
    const viewMode = 'competencia';

    const entries = await prisma.realizedEntry.findMany({
      where: {
        year,
        month,
        viewMode
      },
      include: {
        category: true,
        tenant: true,
        costCenter: true
      }
    });

    const summary = entries.map(e => ({
      id: e.id,
      tenant: e.tenant.name,
      category: e.category.name,
      cc: e.costCenter?.name || 'Geral',
      amount: e.amount,
      description: e.description,
      externalId: e.externalId
    }));

    const total = entries.reduce((acc, e) => acc + e.amount, 0);

    return NextResponse.json({
      success: true,
      count: entries.length,
      total,
      data: summary
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message });
  }
}
