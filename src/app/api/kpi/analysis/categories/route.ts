import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, type, entradaDre, tenantId } = body;

        if (!name || !type || !entradaDre || !tenantId) {
            return NextResponse.json({ success: false, error: 'Parâmetros obrigatórios ausentes' }, { status: 400 });
        }

        // Generate a new UUID prefixed with a mock identifier or just standard UUID
        // Usually, Conta Azul category IDs have format 'tenantId:uuid' or just 'uuid'.
        // Let's see: in prisma/schema.prisma: 'id String @id // Financial Category ID from Conta Azul (UUID)'
        // Let's generate a unique UUID
        const newCategoryId = randomUUID();

        const category = await prisma.category.create({
            data: {
                id: newCategoryId,
                name: name.trim(),
                type: type.toUpperCase(), // 'REVENUE' or 'EXPENSE'
                entradaDre,
                tenantId
            }
        });

        return NextResponse.json({ success: true, data: category });
    } catch (e: any) {
        console.error('[API CATEGORIES POST] Error:', e.message);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
