import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('auth_token')?.value;
        const user = token ? await verifyToken(token) : null;

        if (!user) {
            return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const yearParam = searchParams.get('year');
        const currentYear = yearParam ? parseInt(yearParam) : new Date().getFullYear();

        // 1. Buscar todos os dados necessários
        const [tenants, costCenters, categories, budgetEntries] = await Promise.all([
            prisma.tenant.findMany({ select: { id: true, name: true } }),
            prisma.costCenter.findMany({ 
                where: { NOT: { name: { startsWith: '[INATIVO]' } } },
                select: { id: true, name: true, tenantId: true } 
            }),



            prisma.category.findMany({ select: { id: true, type: true, name: true } }),
            prisma.budgetEntry.findMany({
                where: { year: currentYear },
                select: { amount: true, categoryId: true, costCenterId: true, tenantId: true }
            })
        ]);

        // 2. Mapear tipos de categoria para busca rápida
        // V50: Considerar '01' no nome como REVENUE, independente do tipo vindo do CA
        const categoryTypeMap = new Map(categories.map(c => {
            const isRevenue = c.type === 'REVENUE' || c.name.startsWith('01') || c.name.startsWith('1.');
            return [c.id, isRevenue ? 'REVENUE' : 'EXPENSE'];
        }));

        // 3. Inicializar extrutura de resumo
        const summaryMap = new Map();

        // Garantir que todos os Centros de Custo apareçam, mesmo sem orçamento
        costCenters.forEach(cc => {
            const tenant = tenants.find(t => t.id === cc.tenantId);
            if (!tenant) return;

            const key = `${cc.tenantId}-${cc.id}`;
            summaryMap.set(key, {
                tenantId: cc.tenantId,
                tenantName: tenant.name,
                costCenterId: cc.id,
                costCenterName: cc.name,
                totalRevenue: 0,
                totalExpense: 0,
                hasBudget: false
            });
        });

        // 4. Agregar valores do orçamento
        budgetEntries.forEach(entry => {
            const key = `${entry.tenantId}-${entry.costCenterId}`;
            const summary = summaryMap.get(key);

            if (summary) {
                const type = categoryTypeMap.get(entry.categoryId);
                if (type === 'REVENUE') {
                    summary.totalRevenue += entry.amount;
                } else {
                    summary.totalExpense += entry.amount;
                }

                if (entry.amount !== 0) {
                    summary.hasBudget = true;
                }
            }
        });

        // 5. Converter para array e ordenar
        const result = Array.from(summaryMap.values()).sort((a, b) => {
            // Ordenar por Empresa e depois por Centro de Custo
            if (a.tenantName !== b.tenantName) return a.tenantName.localeCompare(b.tenantName);
            return a.costCenterName.localeCompare(b.costCenterName);
        });

        return NextResponse.json({
            success: true,
            year: currentYear,
            data: result
        });

    } catch (error: any) {
        console.error('Failed to fetch budget summary:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
