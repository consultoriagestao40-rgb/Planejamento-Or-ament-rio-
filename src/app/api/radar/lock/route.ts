import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

async function ensureRadarSchema() {
  try {
    await (prisma as any).$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RadarLock" (
        "id" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "month" INTEGER NOT NULL,
        "year" INTEGER NOT NULL,
        "isLocked" BOOLEAN NOT NULL DEFAULT false,
        "deadline" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "RadarLock_pkey" PRIMARY KEY ("id")
      );
    `);
    
    await (prisma as any).$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "RadarLock_tenantId_month_year_key" ON "RadarLock"("tenantId", "month", "year");
    `);

    // Add foreign key if missing (simplified check)
    try {
      await (prisma as any).$executeRawUnsafe(`
        ALTER TABLE "RadarLock" ADD CONSTRAINT "RadarLock_tenantId_fkey" 
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      `);
    } catch (e) {
      // Constraint might already exist
    }
  } catch (error) {
    console.error('Error ensuring RadarLock schema:', error);
  }
}

export async function GET(request: Request) {
  try {
    await ensureRadarSchema();
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString());

    const locks = await (prisma as any).radarLock.findMany({
      where: { year }
    });

    return NextResponse.json({ success: true, data: locks });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureRadarSchema();
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    const user = token ? await verifyToken(token) : null;

    if (!user || user.role !== 'MASTER') {
      return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 });
    }

    const { tenantId, month, year, isLocked, deadline } = await request.json();

    if (!tenantId || !month || !year) {
      return NextResponse.json({ success: false, error: 'Dados incompletos' }, { status: 400 });
    }

    const lock = await (prisma as any).radarLock.upsert({
      where: {
        tenantId_month_year: { tenantId, month, year }
      },
      update: {
        isLocked: isLocked ?? false,
        deadline: deadline ? new Date(deadline) : null
      },
      create: {
        tenantId,
        month,
        year,
        isLocked: isLocked ?? false,
        deadline: deadline ? new Date(deadline) : null
      }
    });

    return NextResponse.json({ success: true, data: lock });
  } catch (error: any) {
    console.error('Radar Lock POST Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
