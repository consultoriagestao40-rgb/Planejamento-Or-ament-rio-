import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const tenantId = searchParams.get('tenantId');
        
        if (!tenantId) {
            return NextResponse.json({ success: false, error: 'Parâmetro tenantId é obrigatório.' }, { status: 400 });
        }

        const paramYear = searchParams.get('year');
        const year = paramYear ? parseInt(paramYear, 10) : new Date().getFullYear();
        const costCenterId = searchParams.get('costCenterId') || undefined;
        
        // Controles de Projeção
        const defaultRate = parseFloat(searchParams.get('defaultRate') || '0'); // Taxa de inadimplência (0 a 100)
        const overdueAction = searchParams.get('overdueAction') || 'today'; // 'today', 'ignore', 'original'

        // 1. Obter saldos atuais das contas financeiras
        const bankAccounts = await prisma.bankAccount.findMany({
            where: { tenantId }
        });
        const currentBankBalance = bankAccounts.reduce((sum, acc) => sum + acc.balance, 0);

        // Data de hoje (limite entre Realizado e Previsto)
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const todayTime = new Date(todayStr).getTime();

        // 2. Buscar lançamentos Realizados (Caixa) a partir do início do ano alvo
        const realizedEntries = await prisma.realizedEntry.findMany({
            where: {
                tenantId,
                viewMode: 'caixa',
                date: { gte: new Date(`${year}-01-01T00:00:00.000Z`) },
                ...(costCenterId ? { costCenterId } : {})
            },
            include: { category: true }
        });

        // 3. Buscar lançamentos Previstos (A Receber e A Pagar)
        const expectedEntries = await prisma.realizedEntry.findMany({
            where: {
                tenantId,
                viewMode: { in: ['previsto_receber', 'previsto_pagar'] },
                ...(costCenterId ? { costCenterId } : {})
            },
            include: { category: true }
        });

        // 4. Calcular o Saldo Inicial do Ano (Jan 1st)
        // Fórmula: Saldo em Jan 1st = Saldo Atual - Líquido de Caixa de Jan 1st até hoje
        let netCashFlowFromJan1ToToday = 0;
        realizedEntries.forEach(entry => {
            const entryDate = entry.date ? new Date(entry.date) : null;
            if (entryDate && entryDate.getTime() <= today.getTime()) {
                const isRevenue = entry.category.type === 'REVENUE' || entry.category.name.startsWith('01') || entry.category.name.startsWith('1.');
                if (isRevenue) {
                    netCashFlowFromJan1ToToday += entry.amount;
                } else {
                    netCashFlowFromJan1ToToday -= entry.amount;
                }
            }
        });
        const startingBalanceJan1 = currentBankBalance - netCashFlowFromJan1ToToday;

        // 5. Inicializar estrutura dos 12 meses do ano
        const monthlyData = Array.from({ length: 12 }, (_, i) => ({
            month: i + 1,
            name: new Date(year, i, 1).toLocaleString('pt-BR', { month: 'short' }).toUpperCase(),
            startingBalance: 0,
            inflows: 0,
            outflows: 0,
            netFlow: 0,
            endingBalance: 0,
            categories: {} as Record<string, { id: string, name: string, isRevenue: boolean, amount: number }>,
            details: [] as any[]
        }));

        // 6. Processar Realizados (Caixa) nos meses correspondentes
        realizedEntries.forEach(entry => {
            const dateObj = entry.date ? new Date(entry.date) : new Date(year, entry.month - 1, 15);
            // Só consideramos como realizado se a data for menor ou igual a hoje
            if (dateObj.getTime() <= today.getTime()) {
                const monthIdx = dateObj.getMonth();
                if (dateObj.getFullYear() === year && monthIdx >= 0 && monthIdx < 12) {
                    const isRevenue = entry.category.type === 'REVENUE' || entry.category.name.startsWith('01') || entry.category.name.startsWith('1.');
                    const amount = entry.amount;

                    if (isRevenue) {
                        monthlyData[monthIdx].inflows += amount;
                    } else {
                        monthlyData[monthIdx].outflows += amount;
                    }

                    // Detalhe por Categoria
                    const catKey = entry.category.id;
                    if (!monthlyData[monthIdx].categories[catKey]) {
                        monthlyData[monthIdx].categories[catKey] = {
                            id: entry.category.id,
                            name: entry.category.name,
                            isRevenue,
                            amount: 0
                        };
                    }
                    monthlyData[monthIdx].categories[catKey].amount += amount;

                    monthlyData[monthIdx].details.push({
                        id: entry.id,
                        date: dateObj.toISOString().split('T')[0],
                        description: entry.description,
                        customer: entry.customer,
                        amount,
                        isRevenue,
                        isRealized: true,
                        category: entry.category.name
                    });
                }
            }
        });

        // 7. Processar Previstos (Projeções)
        expectedEntries.forEach(entry => {
            const origDate = entry.date ? new Date(entry.date) : new Date(year, entry.month - 1, 15);
            const isRevenue = entry.viewMode === 'previsto_receber';
            
            let projDate = new Date(origDate);
            let isOverdue = origDate.getTime() < todayTime;

            // Tratamento de Atrasados
            if (isOverdue) {
                if (overdueAction === 'ignore') {
                    return; // Ignora o lançamento
                } else if (overdueAction === 'today') {
                    projDate = new Date(today); // Projeta para hoje
                }
                // Se overdueAction === 'original', mantemos origDate
            }

            // Aplicar taxa de inadimplência apenas em Receitas Previstas
            let amount = entry.amount;
            if (isRevenue) {
                amount = amount * (1 - defaultRate / 100);
            }

            const monthIdx = projDate.getMonth();
            if (projDate.getFullYear() === year && monthIdx >= 0 && monthIdx < 12) {
                if (isRevenue) {
                    monthlyData[monthIdx].inflows += amount;
                } else {
                    monthlyData[monthIdx].outflows += amount;
                }

                // Detalhe por Categoria
                const catKey = entry.category.id;
                if (!monthlyData[monthIdx].categories[catKey]) {
                    monthlyData[monthIdx].categories[catKey] = {
                        id: entry.category.id,
                        name: entry.category.name,
                        isRevenue,
                        amount: 0
                    };
                }
                monthlyData[monthIdx].categories[catKey].amount += amount;

                monthlyData[monthIdx].details.push({
                    id: entry.id,
                    date: projDate.toISOString().split('T')[0],
                    originalDate: origDate.toISOString().split('T')[0],
                    description: entry.description,
                    customer: entry.customer,
                    amount,
                    isRevenue,
                    isRealized: false,
                    isOverdue,
                    category: entry.category.name
                });
            }
        });

        // 8. Calcular Saldos Iniciais e Finais em Cascata (Meses 1 a 12)
        let runningBalance = startingBalanceJan1;
        for (let i = 0; i < 12; i++) {
            monthlyData[i].startingBalance = runningBalance;
            monthlyData[i].netFlow = monthlyData[i].inflows - monthlyData[i].outflows;
            monthlyData[i].endingBalance = runningBalance + monthlyData[i].netFlow;
            runningBalance = monthlyData[i].endingBalance;
        }

        // 9. Gerar Projeção Diária/Semanal (para o Gráfico de Linha)
        // Projetamos a partir de hoje até 180 dias no futuro
        const dailyProjection: any[] = [];
        let dailyRunningBalance = currentBankBalance;
        const totalProjectionDays = 180;
        
        // Inicializar os dias da projeção
        const dailyMap = new Map<string, number>();
        for (let i = 0; i <= totalProjectionDays; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            const key = d.toISOString().split('T')[0];
            dailyMap.set(key, 0);
        }

        // Lançar previstos nos dias correspondentes
        expectedEntries.forEach(entry => {
            const origDate = entry.date ? new Date(entry.date) : new Date();
            const isRevenue = entry.viewMode === 'previsto_receber';
            
            let projDate = new Date(origDate);
            let isOverdue = origDate.getTime() < todayTime;

            if (isOverdue) {
                if (overdueAction === 'ignore') return;
                else if (overdueAction === 'today') projDate = new Date(today);
            }

            let amount = entry.amount;
            if (isRevenue) {
                amount = amount * (1 - defaultRate / 100);
            }

            const key = projDate.toISOString().split('T')[0];
            if (dailyMap.has(key)) {
                const currentVal = dailyMap.get(key) || 0;
                dailyMap.set(key, currentVal + (isRevenue ? amount : -amount));
            }
        });

        // Calcular saldo acumulado dia a dia
        const sortedDays = Array.from(dailyMap.keys()).sort();
        sortedDays.forEach(dayStr => {
            const netDayFlow = dailyMap.get(dayStr) || 0;
            dailyRunningBalance += netDayFlow;
            dailyProjection.push({
                date: dayStr,
                formattedDate: new Date(dayStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
                netFlow: netDayFlow,
                balance: dailyRunningBalance
            });
        });

        return NextResponse.json({
            success: true,
            year,
            currentBankBalance,
            startingBalanceJan1,
            monthlyData,
            dailyProjection,
            bankAccounts
        });

    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
