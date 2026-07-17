import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        const bankAccounts = await prisma.bankAccount.findMany({
            include: { tenant: true }
        });
        
        const expectedReceivables = await prisma.realizedEntry.findMany({
            where: { viewMode: 'previsto_receber' },
            select: { id: true, date: true, year: true, month: true, amount: true, description: true, customer: true, isRealized: true, tenantId: true }
        });

        const expectedPayables = await prisma.realizedEntry.findMany({
            where: { viewMode: 'previsto_pagar' },
            select: { id: true, date: true, year: true, month: true, amount: true, description: true, customer: true, isRealized: true, tenantId: true }
        });

        // Let's summarize expected entries by year/month and check if they are realized or not
        const recSummary = expectedReceivables.reduce((acc: any, curr) => {
            const key = `${curr.year}-${curr.month}`;
            if (!acc[key]) acc[key] = { count: 0, total: 0 };
            acc[key].count++;
            acc[key].total += curr.amount;
            return acc;
        }, {});

        const paySummary = expectedPayables.reduce((acc: any, curr) => {
            const key = `${curr.year}-${curr.month}`;
            if (!acc[key]) acc[key] = { count: 0, total: 0 };
            acc[key].count++;
            acc[key].total += curr.amount;
            return acc;
        }, {});

        return NextResponse.json({ 
            success: true, 
            bankAccounts, 
            receivablesSummary: recSummary, 
            payablesSummary: paySummary,
            totalExpectedReceivables: expectedReceivables.reduce((sum, e) => sum + e.amount, 0),
            totalExpectedPayables: expectedPayables.reduce((sum, e) => sum + e.amount, 0),
            sampleReceivables: expectedReceivables.slice(0, 10),
            samplePayables: expectedPayables.slice(0, 10)
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
