import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const deleted = await prisma.budgetEntry.deleteMany({
      where: {
        OR: [
          { amount: 1 },
          { amount: 0.1 }
        ]
      }
    });
    return NextResponse.json({ success: true, count: deleted.count, message: 'Fantasmas de R$ 1 removidos' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
