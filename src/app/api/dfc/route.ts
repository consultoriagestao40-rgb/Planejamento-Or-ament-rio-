import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function classifyCategory(
    categoryName: string, 
    isRevenue: boolean, 
    isConsolidated: boolean
): 'OPERATIONAL_IN' | 'OPERATIONAL_OUT' | 'CAPEX' | 'FINANCING' | 'TRANSFER' {
    const name = categoryName.toUpperCase().trim();
    
    // 1. Verificar Transferências Internas (mesmo CNPJ): Grupo 06.1.2 e 06.2.2 (ou 6.1.2 / 6.2.2)
    const isInternalTransfer = 
        name.startsWith('06.1.2') || name.startsWith('06.2.2') || 
        name.startsWith('6.1.2') || name.startsWith('6.2.2');
        
    // 2. Verificar Transferências Intercompany (empresas do grupo): Grupo 06.1.1 e 06.2.1 (ou 6.1.1 / 6.2.1)
    const isIntercompanyTransfer = 
        name.startsWith('06.1.1') || name.startsWith('06.2.1') || 
        name.startsWith('6.1.1') || name.startsWith('6.2.1');

    if (isInternalTransfer) {
        return 'TRANSFER';
    }

    if (isIntercompanyTransfer) {
        return isConsolidated ? 'TRANSFER' : 'FINANCING';
    }

    // Outros grupos de financiamento específicos sob o grupo 06 (empréstimos, sócios, aportes)
    const isGroup06Financing = 
        name.startsWith('06.1.5') || name.startsWith('06.3.1') || 
        name.startsWith('06.1.6') || name.startsWith('06.3.2') ||
        name.startsWith('6.1.5') || name.startsWith('6.3.1') || 
        name.startsWith('6.1.6') || name.startsWith('6.3.2');

    // 3. Verificar CAPEX (Grupo 07 ou palavras-chave)
    const isCapex = name.startsWith('07') || name.startsWith('7.') || 
                    name.includes('CAPEX') || name.includes('INVESTIMENTO') || name.includes('IMOBILIZADO');
    if (isCapex) {
        return 'CAPEX';
    }
    
    // 4. Verificar FINANCING (Grupo 08 ou palavras-chave)
    const isFinancing = name.startsWith('08') || name.startsWith('8.') || 
                        isGroup06Financing ||
                        name.includes('FINANCIAMENTO') || name.includes('EMPRESTIMO') || name.includes('EMPRÉSTIMO') ||
                        name.includes('SÓCIO') || name.includes('SOCIO') || name.includes('APORTE') ||
                        name.includes('MÚTUO') || name.includes('MUTUO');
    if (isFinancing) {
        return 'FINANCING';
    }
    
    // Default to Operational In/Out
    return isRevenue ? 'OPERATIONAL_IN' : 'OPERATIONAL_OUT';
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const tenantId = searchParams.get('tenantId');
        
        if (!tenantId) {
            return NextResponse.json({ success: false, error: 'Parâmetro tenantId é obrigatório.' }, { status: 400 });
        }

        const isConsolidated = tenantId.toUpperCase() === 'ALL';
        const tenantFilter = isConsolidated ? {} : { tenantId };

        const year = 2026;
        const costCenterId = searchParams.get('costCenterId') || undefined;
        
        // Controles de Projeção
        const defaultRate = parseFloat(searchParams.get('defaultRate') || '0'); // Taxa de inadimplência (0 a 100)
        const overdueAction = searchParams.get('overdueAction') || 'today'; // 'today', 'ignore', 'original'

        // 1. Obter saldos atuais das contas financeiras
        const bankAccounts = await prisma.bankAccount.findMany({
            where: tenantFilter,
            include: {
                tenant: {
                    select: { name: true }
                }
            }
        });
        const currentBankBalance = bankAccounts.reduce((sum, acc) => sum + acc.balance, 0);

        // Data de hoje (limite entre Realizado e Previsto)
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const todayTime = new Date(todayStr).getTime();

        // 2. Buscar lançamentos Realizados (Caixa) a partir do início do ano alvo
        const realizedEntries = await prisma.realizedEntry.findMany({
            where: {
                ...tenantFilter,
                viewMode: 'caixa',
                year: 2026, // Filtrar estritamente apenas dados do ano de 2026!
                ...(costCenterId ? { costCenterId } : {})
            },
            include: { category: true }
        });

        // 3. Buscar lançamentos Previstos (A Receber e A Pagar)
        const expectedEntries = await prisma.realizedEntry.findMany({
            where: {
                ...tenantFilter,
                viewMode: { in: ['previsto_receber', 'previsto_pagar'] },
                year: 2026, // Filtrar estritamente apenas previstos originais do ano de 2026!
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
                const dfcClass = classifyCategory(entry.category.name, isRevenue, isConsolidated);
                
                if (dfcClass === 'OPERATIONAL_IN') {
                    netCashFlowFromJan1ToToday += entry.amount;
                } else if (dfcClass === 'OPERATIONAL_OUT') {
                    netCashFlowFromJan1ToToday -= entry.amount;
                } else if (dfcClass === 'CAPEX') {
                    netCashFlowFromJan1ToToday -= entry.amount;
                } else if (dfcClass === 'FINANCING') {
                    netCashFlowFromJan1ToToday += isRevenue ? entry.amount : -entry.amount;
                }
            }
        });
        const startingBalanceJan1 = currentBankBalance - netCashFlowFromJan1ToToday;

        // 5. Inicializar estrutura dos 12 meses do ano
        const monthlyData = Array.from({ length: 12 }, (_, i) => ({
            month: i + 1,
            name: new Date(year, i, 1).toLocaleString('pt-BR', { month: 'short' }).toUpperCase(),
            startingBalance: 0,
            recebimentosOperacionais: 0,
            pagamentosOperacionais: 0,
            fluxoOperacional: 0,
            capex: 0,
            fluxoFinanciamento: 0,
            inflows: 0, // Keep inflows/outflows for general metrics / charts
            outflows: 0,
            netFlow: 0,
            endingBalance: 0,
            categories: {} as Record<string, { id: string, name: string, isRevenue: boolean, amount: number, dfcClass: 'OPERATIONAL_IN' | 'OPERATIONAL_OUT' | 'CAPEX' | 'FINANCING' }>,
            details: [] as any[]
        }));

        // 6. Processar Realizados (Caixa) nos meses correspondentes
        realizedEntries.forEach(entry => {
            const dateObj = entry.date ? new Date(entry.date) : new Date(year, entry.month - 1, 15);
            if (dateObj.getTime() <= today.getTime()) {
                const monthIdx = dateObj.getMonth();
                if (dateObj.getFullYear() === year && monthIdx >= 0 && monthIdx < 12) {
                    const isRevenue = entry.category.type === 'REVENUE' || entry.category.name.startsWith('01') || entry.category.name.startsWith('1.');
                    const amount = entry.amount;
                    const dfcClass = classifyCategory(entry.category.name, isRevenue, isConsolidated);

                    if (dfcClass !== 'TRANSFER') {
                        if (dfcClass === 'OPERATIONAL_IN') {
                            monthlyData[monthIdx].recebimentosOperacionais += amount;
                        } else if (dfcClass === 'OPERATIONAL_OUT') {
                            monthlyData[monthIdx].pagamentosOperacionais += amount;
                        } else if (dfcClass === 'CAPEX') {
                            monthlyData[monthIdx].capex += amount;
                        } else if (dfcClass === 'FINANCING') {
                            monthlyData[monthIdx].fluxoFinanciamento += isRevenue ? amount : -amount;
                        }

                        if (isRevenue) {
                            monthlyData[monthIdx].inflows += amount;
                        } else {
                            monthlyData[monthIdx].outflows += amount;
                        }

                        // Detalhe por Categoria (Agrupado por Nome para consolidar)
                        const catKey = entry.category.name;
                        if (!monthlyData[monthIdx].categories[catKey]) {
                            monthlyData[monthIdx].categories[catKey] = {
                                id: entry.category.id,
                                name: entry.category.name,
                                isRevenue,
                                amount: 0,
                                dfcClass
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
                            category: entry.category.name,
                            dfcClass
                        });
                    }
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
                    return;
                } else if (overdueAction === 'today') {
                    projDate = new Date(today);
                }
            }

            // Aplicar taxa de inadimplência apenas em Receitas Previstas
            let amount = entry.amount;
            if (isRevenue) {
                amount = amount * (1 - defaultRate / 100);
            }

            const monthIdx = projDate.getMonth();
            if (projDate.getFullYear() === year && monthIdx >= 0 && monthIdx < 12) {
                const dfcClass = classifyCategory(entry.category.name, isRevenue, isConsolidated);

                if (dfcClass !== 'TRANSFER') {
                    if (dfcClass === 'OPERATIONAL_IN') {
                        monthlyData[monthIdx].recebimentosOperacionais += amount;
                    } else if (dfcClass === 'OPERATIONAL_OUT') {
                        monthlyData[monthIdx].pagamentosOperacionais += amount;
                    } else if (dfcClass === 'CAPEX') {
                        monthlyData[monthIdx].capex += amount;
                    } else if (dfcClass === 'FINANCING') {
                        monthlyData[monthIdx].fluxoFinanciamento += isRevenue ? amount : -amount;
                    }

                    if (isRevenue) {
                        monthlyData[monthIdx].inflows += amount;
                    } else {
                        monthlyData[monthIdx].outflows += amount;
                    }

                    // Detalhe por Categoria (Agrupado por Nome para consolidar)
                    const catKey = entry.category.name;
                    if (!monthlyData[monthIdx].categories[catKey]) {
                        monthlyData[monthIdx].categories[catKey] = {
                            id: entry.category.id,
                            name: entry.category.name,
                            isRevenue,
                            amount: 0,
                            dfcClass
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
                        category: entry.category.name,
                        dfcClass
                    });
                }
            }
        });

        // 8. Calcular Saldos Iniciais, Fluxos e Finais em Cascata (Meses 1 a 12)
        let runningBalance = startingBalanceJan1;
        for (let i = 0; i < 12; i++) {
            monthlyData[i].startingBalance = runningBalance;
            monthlyData[i].fluxoOperacional = monthlyData[i].recebimentosOperacionais - monthlyData[i].pagamentosOperacionais;
            monthlyData[i].netFlow = monthlyData[i].fluxoOperacional - monthlyData[i].capex + monthlyData[i].fluxoFinanciamento;
            monthlyData[i].endingBalance = runningBalance + monthlyData[i].netFlow;
            runningBalance = monthlyData[i].endingBalance;
        }

        // 9. Gerar Projeção Diária/Semanal (para o Gráfico de Linha)
        // Projetamos a partir de hoje até 180 dias no futuro
        const dailyProjection: any[] = [];
        let dailyRunningBalance = currentBankBalance;
        const totalProjectionDays = 180;
        
        const dailyMap = new Map<string, { inflows: number; outflows: number }>();
        for (let i = 0; i <= totalProjectionDays; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            const key = d.toISOString().split('T')[0];
            dailyMap.set(key, { inflows: 0, outflows: 0 });
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

            const dfcClass = classifyCategory(entry.category.name, isRevenue, isConsolidated);
            if (dfcClass === 'TRANSFER') return;

            const key = projDate.toISOString().split('T')[0];
            if (dailyMap.has(key)) {
                const dayData = dailyMap.get(key)!;
                if (isRevenue) {
                    dayData.inflows += amount;
                } else {
                    dayData.outflows += amount;
                }
            }
        });

        // Calcular saldo acumulado dia a dia
        const sortedDays = Array.from(dailyMap.keys()).sort();
        sortedDays.forEach(dayStr => {
            const dayData = dailyMap.get(dayStr) || { inflows: 0, outflows: 0 };
            const netDayFlow = dayData.inflows - dayData.outflows;
            dailyRunningBalance += netDayFlow;
            dailyProjection.push({
                date: dayStr,
                formattedDate: new Date(dayStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
                inflows: dayData.inflows,
                outflows: dayData.outflows,
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
