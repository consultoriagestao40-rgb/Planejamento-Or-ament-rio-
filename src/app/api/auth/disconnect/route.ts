
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST() {
    try {
        // Clear all tenant tokens (assuming single tenant for now)
        await prisma.tenant.deleteMany({});
        // OR update to null if we want to keep the tenant record
        // await prisma.tenant.updateMany({ data: { accessToken: null, refreshToken: null } });

        // For simple restart, deleting is fine as the sync recreates it or the callback does.
        // Actually, callback uses `upsert`.

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ success: false, error: 'Failed to disconnect' }, { status: 500 });
    }
}
