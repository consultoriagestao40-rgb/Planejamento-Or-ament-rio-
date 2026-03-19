import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';
import { getPrimaryTenantId, getAllVariantIds } from '@/lib/tenant-utils';

export async function fetchAllTransactionsForYear(accessToken: string, baseUrl: string, targetYear: number, viewMode: 'caixa' | 'competencia', isExpense = false, pushLog?: (msg: string) => void) {
    let page = 1;
    let hasMore = true;
    const transactions: any[] = [];

    while (hasMore && page <= 50) {
        const cacheBuster = `t=${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const url = `${baseUrl.includes('?') ? baseUrl : baseUrl + '?'}&pagina=${page}&tamanho_pagina=100&itens_por_pagina=100&cb=${cacheBuster}`;
        try {
            const res = await fetch(url, { 
                headers: { 'Authorization': `Bearer ${accessToken}` },
                cache: 'no-store'
            });
            
            const rawText = await res.text();
            if (!res.ok) {
                if (pushLog) pushLog(`[API ERROR] status=${res.status} url=${url.split('?')[0]}`);
                break;
            }

            const data = JSON.parse(rawText);
            const items = Array.isArray(data) ? data : (data.itens || data.items || []);
            
            if (page === 1 && pushLog) {
                pushLog(`[DEBUG] Page 1: status=${res.status} items=${items.length} raw=${rawText.substring(0, 150)}`);
            }
            
            if (items.length === 0) break;

            for (const item of items) {
                if ((item.status || '').toUpperCase().includes('CANCEL')) continue;

                let dateStr: string;
                let amount: number;

                const rawAmount = item.pago || item.valor_pago || item.valor || item.amount || item.total || 0;
                amount = Math.abs(rawAmount);

                if (viewMode === 'caixa') {
                    dateStr = item.data_pagamento || item.baixado_em || item.data_vencimento || item.vencimento;
                    const status = (item.status || '').toUpperCase();
                    const isPaid = status === 'BAIXADO' || status === 'RECEBIDO' || status === 'PAGO' || status === 'QUITADO' || status === 'ACQUITTED' || 
                                   (item.pago && item.pago > 0) || (item.valor_total_pago && item.valor_total_pago > 0) || (item.valor_pago && item.valor_pago > 0);
                    if (!isPaid) continue;
                } else {
                    dateStr = item.data || item.data_competencia || item.data_emissao || item.data_vencimento || item.vencimento;
                }

                if (!dateStr) continue;
                const [yStr, mStr] = dateStr.includes('T') ? dateStr.split('T')[0].split('-') : dateStr.split('-');
                const itemYear = parseInt(yStr);
                const itemMonth = parseInt(mStr);

                if (itemYear !== targetYear) continue;

                transactions.push({
                    id: item.id,
                    description: item.descricao,
                    month: itemMonth,
                    amount: isExpense ? -Math.abs(amount) : Math.abs(amount),
                    categories: item.categorias || [],
                    costCenters: item.centros_de_custo || []
                });
            }

            if (items.length < 100) hasMore = false;
            else page++;
        } catch (e: any) {
            if (pushLog) pushLog(`[FETCH CRASH] ${e.message}`);
            hasMore = false;
        }
    }

    return transactions;
}

export async function fetchSalesForYear(accessToken: string, targetYear: number, pushLog?: (msg: string) => void) {
    let page = 1;
    let hasMore = true;
    const salesData: any[] = [];
    const startStr = `${targetYear}-01-01`;
    const endStr = `${targetYear}-12-31`;

    let url = `https://api-v2.contaazul.com/v1/venda/busca?data_inicio=${startStr}&data_fim=${endStr}&tamanho_pagina=100`;

    while (hasMore && page <= 50) {
        try {
            const res = await fetch(`${url}&pagina=${page}`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (!res.ok) break;
            const data = await res.json();
            const itemList = Array.isArray(data) ? data : (data.itens || data.eventos || data.vendas || []);
        
            if (itemList.length === 0) {
                hasMore = false;
                break;
            }

            for (const item of itemList) {
                if ((item.status || '').includes('CANCEL')) continue;
                const dStr = item.data_venda || item.data || '';
                const m = parseInt(dStr.split('-')[1]);
                if (m) {
                    salesData.push({ month: m, amount: item.valor_total || item.valor || 0 });
                }
            }
            if (itemList.length < 100) hasMore = false;
            else page++;
        } catch (e) { hasMore = false; }
    }
    return salesData;
}

export async function runCronSync(reqYear: number, tenantId?: string, pushLog?: (msg: string) => void) {
    if (pushLog) pushLog(`[SYNC] Invocando Sincronização v0.9.49 - Mirror 1:1 [Year ${reqYear}]`);
    
    const tenants = await prisma.tenant.findMany();
    const allCategories = await prisma.category.findMany();
    const allCostCenters = await prisma.costCenter.findMany();

    // ID Map - Map RAW CA ID -> COMPOSITE DB ID
    const catMap = new Map<string, string>();
    allCategories.forEach(c => {
        const rawId = c.id.includes(':') ? c.id.split(':')[1] : c.id;
        catMap.set(rawId, c.id);
    });

    const ccMap = new Map<string, string>();
    allCostCenters.forEach(c => {
        const rawId = c.id.includes(':') ? c.id.split(':')[1] : c.id;
        ccMap.set(rawId, c.id);
    });

    const report = [];

    const targets = tenantId ? tenants.filter(t => t.id === tenantId) : tenants;
    for (const t of targets) {
        try {
            const primaryId = await getPrimaryTenantId(t.id);
            const allEntityIds = await getAllVariantIds(t.id);
            const authResponse = await getValidAccessToken(primaryId);
            const token = typeof authResponse === 'string' ? authResponse : (authResponse as any).token;

            if (pushLog) pushLog(`[SYNC] [${t.name}] Iniciando...`);

            for (const viewMode of ['competencia', 'caixa'] as const) {
                const startStr = `${reqYear - 1}-01-01`; // Start 1 year before
                const endStr = `${reqYear + 1}-12-31`;   // End 1 year after
                
                const endpoints = viewMode === 'caixa' ? [
                    { name: 'Recebimentos', url: 'https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar', isExpense: false },
                    { name: 'Pagamentos', url: 'https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar', isExpense: true }
                ] : [
                    { name: 'Recebimentos', url: 'https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar', isExpense: false },
                    { name: 'Vendas', url: 'https://api-v2.contaazul.com/v1/vendas/buscar', isExpense: false },
                    { name: 'Pagamentos', url: 'https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar', isExpense: true }
                ];

                const entriesToSave: any[] = [];
                let tRevenue = 0;
                let tExpense = 0;
                let skippedByYear = 0;
                let skippedByCat = 0;

                for (const ep of endpoints) {
                    const dateParams = ep.name === 'Vendas' 
                        ? `data_inicio=${startStr}&data_fim=${endStr}`
                        : `data_vencimento_de=${startStr}&data_vencimento_ate=${endStr}`;
                        
                    const fullUrl = `${ep.url}?${dateParams}`;
                    const items = await fetchAllTransactionsForYear(token, fullUrl, reqYear, viewMode, ep.isExpense, pushLog);

                    for (const tx of items) {
                        if (tx.month === 0) { skippedByYear++; continue; } 

                        if (ep.isExpense) tExpense += Math.abs(tx.amount);
                        else tRevenue += Math.abs(tx.amount);

                        let mainCatId = tx.categories?.[0]?.id;
                        let mainCatName = tx.categories?.[0]?.name;
                        const mainCcId = tx.costCenters?.[0]?.id;

                        // Support for Vendas V1 item categories
                        if (!mainCatId && ep.name === 'Vendas') {
                            const firstItem = tx.itens?.[0] || tx.servicos?.[0];
                            mainCatId = firstItem?.categoria?.id;
                            mainCatName = firstItem?.categoria?.nome || 'Receita de Vendas';
                        }

                        if (!mainCatId) mainCatId = 'SYSTEM_GENERIC_REVENUE';

                        if (mainCatId) {
                            if (!catMap.has(mainCatId)) {
                                const newCatName = mainCatName || 'Importado CA';
                                const newCatId = `${t.id}:${mainCatId}`;
                                const catType = ep.isExpense ? 'EXPENSE' : 'REVENUE';
                                
                                let entradaDre = null;
                                const lowerName = newCatName.toLowerCase();
                                if (lowerName.includes('venda') || lowerName.includes('receita') || lowerName.includes('faturamento')) {
                                    entradaDre = '01. RECEITA BRUTA';
                                } else if (lowerName.includes('imposto') || lowerName.includes('tributo')) {
                                    entradaDre = '02. TRIBUTO SOBRE FATURAMENTO';
                                }

                                try {
                                    await prisma.category.upsert({
                                        where: { id: newCatId },
                                        create: { id: newCatId, name: newCatName, tenantId: t.id, type: catType, entradaDre },
                                        update: { name: newCatName }
                                    });
                                    catMap.set(mainCatId, newCatId);
                                    if (pushLog) pushLog(`[SYNC] [${t.name}] Criada categoria faltante: ${newCatName}`);
                                } catch (e) {
                                    skippedByCat++;
                                    continue;
                                }
                            }

                            entriesToSave.push({
                                tenantId: t.id,
                                categoryId: catMap.get(mainCatId)!,
                                costCenterId: (mainCcId && ccMap.has(mainCcId)) ? ccMap.get(mainCcId)! : null,
                                year: reqYear,
                                month: tx.month,
                                amount: tx.amount,
                                viewMode: viewMode,
                                description: tx.description || 'CONTA AZUL SYNC'
                            });
                        } else {
                            skippedByCat++;
                        }
                    }

                    if (pushLog && (skippedByYear > 0 || skippedByCat > 0)) {
                        pushLog(`[SYNC] [${t.name}] [${viewMode}] [${ep.name}] Processados: ${items.length}, Salvos: ${entriesToSave.length}. Pulados: ${skippedByYear} (data), ${skippedByCat} (cat)`);
                    }
                }

                // Cleanup and save
                await prisma.realizedEntry.deleteMany({
                    where: { 
                        tenantId: t.id, 
                        year: reqYear, 
                        viewMode: viewMode
                    }
                });

                if (entriesToSave.length > 0) {
                    await prisma.realizedEntry.createMany({ data: entriesToSave });
                }

                if (pushLog) pushLog(`[SYNC] [${t.name}] [${viewMode}] Salvos ${entriesToSave.length} registros. Rev: ${tRevenue.toFixed(2)}, Exp: ${tExpense.toFixed(2)}`);
            }
            report.push({ tenant: t.name, status: 'Success' });
        } catch (err: any) {
            if (pushLog) pushLog(`[SYNC ERROR] [${t.name}] ${err.message}`);
            report.push({ tenant: t.name, status: 'Error', error: err.message });
        }
    }
    return report;
}
