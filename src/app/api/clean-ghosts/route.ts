import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const deleted = await prisma.budgetEntry.deleteMany({
      where: {
        amount: 1, // Limpa exatamente os valores R$ 1 enraizados
        year: 2026 // Apenas para 2026
      }
    });
    return NextResponse.json({ success: true, count: deleted.count, message: 'Fantasmas de R$ 1 removidos' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
