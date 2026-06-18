import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // Query triggers for RealizedEntry
        const triggers = await prisma.$queryRawUnsafe(`
            SELECT trigger_name, event_manipulation, action_statement 
            FROM information_schema.triggers 
            WHERE event_object_table = 'RealizedEntry';
        `);

        // Query check constraints for RealizedEntry
        const constraints = await prisma.$queryRawUnsafe(`
            SELECT conname, pg_get_constraintdef(oid) as definition 
            FROM pg_constraint 
            WHERE conrelid = '"RealizedEntry"'::regclass;
        `);

        return NextResponse.json({
            success: true,
            triggers,
            constraints
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
