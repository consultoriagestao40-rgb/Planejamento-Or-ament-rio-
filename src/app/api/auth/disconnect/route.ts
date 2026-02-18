
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST() {
    try {
        // Clear all dependent records first due to lack of Cascade Delete in Schema
        await prisma.budgetEntry.deleteMany({});
        await prisma.costCenter.deleteMany({});
        await prisma.category.deleteMany({});

        // Then delete the tenant
        await prisma.tenant.deleteMany({});

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Disconnect failed:", error);
        return NextResponse.json({ success: false, error: error.message || 'Failed to disconnect' }, { status: 500 });
    }
}
