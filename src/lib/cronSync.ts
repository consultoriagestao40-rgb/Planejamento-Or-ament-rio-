import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';
import { getPrimaryTenantId, getAllVariantIds } from '@/lib/tenant-utils';
// V0.3.11-BYPASS-CACHE-1773618480

async function fetchAllTransactionsForYear(accessToken: string, baseUrl: string, targetYear: number, viewMode: 'caixa' | 'competencia', isExpense = false) {
    let page = 1;
    let hasMore = true;
    const transactions: any[] = [];

    while (hasMore && page <= 50) {
        const url = `${baseUrl}&pagina=${page}`;
        try {
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (!res.ok) {
                console.error(`Cron API fetch error ${res.status} on ${url}`);
                break;
            }

            const data = await res.json();
            const items = data.itens || [];
            if (items.length === 0) break;

            for (const item of items) {
                if ((item.status || '').toUpperCase().includes('CANCEL')) continue;

                const cats = item.categorias || [];
                let ccs = item.centros_de_custo || [];

                // Se houver rateio (centro de custo OU múltiplas categorias), buscamos detalhes
                if (ccs.length > 1 || cats.length > 1) {
                    try {
                        const pRes = await fetch(`https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/parcelas/${item.id}`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
                        if (pRes.ok) {
                            const pData = await pRes.json();
                            if (pData.evento && pData.evento.rateio) {
                                // 1. RATEIO POR CATEGORIA (PARA VALOR BRUTO)
                                const catRateioMap = new Map();
                                pData.evento.rateio.forEach((r: any) => {
                                    if (r.id_categoria) {
                                        catRateioMap.set(r.id_categoria, (catRateioMap.get(r.id_categoria) || 0) + (r.valor || 0));
                                    }
                                });
                                // Injetar valores reais nas categorias do item para o loop de agregacao
                                cats.forEach((c: any) => {
                                    if (catRateioMap.has(c.id)) {
                                        c.valor = catRateioMap.get(c.id);
                                    }
                                });

                                // 2. RATEIO POR CENTRO DE CUSTO
                                const rateioMap = new Map();
                                pData.evento.rateio.forEach((r: any) => {
                                    if (r.rateio_centro_custo && r.valor) {
                                        r.rateio_centro_custo.forEach((rc: any) => {
                                            const percent = (rc.valor || 0) / r.valor;
                                            const proportionalValue = (item.total || item.valor || 0) * percent;
                                            rateioMap.set(rc.id_centro_custo, (rateioMap.get(rc.id_centro_custo) || 0) + proportionalValue);
                                        });
                                    }
                                });
                                const uniqueCcsMap = new Map();
                                ccs.forEach((cc: any) => {
                                    const val = rateioMap.has(cc.id) ? rateioMap.get(cc.id) : cc.valor;
                                    uniqueCcsMap.set(cc.id, (uniqueCcsMap.get(cc.id) || 0) + val);
                                });
                                ccs = Array.from(uniqueCcsMap.entries()).map(([id, valor]) => ({ id, valor }));
                            }
                        }
                    } catch(e) {}
                }

                let dateStr: string;
                let amount: number;

                // CA uses 'pago' or 'total' for the actual values in many responses
                const rawAmount = item.pago || item.valor_pago || item.valor || item.amount || item.total || 0;
                amount = Math.abs(rawAmount);

                if (viewMode === 'caixa') {
                    dateStr = item.data_pagamento || item.baixado_em || item.data_vencimento || item.vencimento;
                    const status = (item.status || '').toUpperCase();
                    const isPaid = status === 'BAIXADO' || status === 'RECEBIDO' || status === 'PAGO' || status === 'QUITADO' || status === 'ACQUITTED' || 
                                   (item.pago && item.pago > 0) || (item.valor_total_pago && item.valor_total_pago > 0) || (item.valor_pago && item.valor_pago > 0);
                    if (!isPaid) continue;
                } else {
                    dateStr = item.data_competencia || item.data_vencimento || item.vencimento;
                }

                const dateObj = dateStr ? new Date(dateStr) : new Date();
                // Filter by year after extracting the correct date field
                if (dateObj.getFullYear() !== targetYear) continue;

                transactions.push({
                    id: item.id,
                    description: item.descricao,
                    month: dateObj.getMonth() + 1, // 1-12 to match budgets logic
                    amount: isExpense ? -Math.abs(amount) : Math.abs(amount),
                    categories: cats,
                    costCenters: ccs
                });
            }

            if (items.length < 100) hasMore = false;
            else page++;
        } catch (e: any) {
            hasMore = false;
        }
    }

    return transactions;
}

export async function runCronSync(reqYear: number, targetTenantId?: string) {
    const logs: string[] = [];
    const pushLog = (msg: string) => {
        console.log(msg);
        logs.push(msg);
    };

    let allTenants;
    if (targetTenantId && targetTenantId !== 'ALL') {
        allTenants = await prisma.tenant.findMany({ where: { id: targetTenantId } });
    } else {
        allTenants = await prisma.tenant.findMany({ orderBy: { updatedAt: 'desc' } });
    }

    if (allTenants.length === 0) return { success: false, error: 'No tenants' };

    const companyMap = new Map();
    allTenants.forEach(t => {
        const cleanCnpj = (t.cnpj || '').replace(/\D/g, '');
        const cleanName = (t.name || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        const key = cleanCnpj !== '' ? cleanCnpj : cleanName;
        
        if (!companyMap.has(key)) {
            companyMap.set(key, t);
        } else {
            // ALWAYS pick the oldest one (by createdAt) or the one with the lowest ID alphabetically
            // to ensure stable primary ID across different sync triggerings.
            const existing = companyMap.get(key);
            if (t.id < existing.id) {
                companyMap.set(key, t);
            }
        }
    });

    const tenants = Array.from(companyMap.values());
    const report = [];

    for (const t of tenants) {
        let token: string = '';
        try {
            const res = await getValidAccessToken(t.id);
            token = res.token;
        } catch (e: any) {
            report.push({ tenant: t.name, status: `Token Error: ${e.message}` });
            continue;
        }
        
        const { getPrimaryTenantId } = await import('./tenant-utils');
        const primaryId = await getPrimaryTenantId(t);
        
        // 1. FRESH METADATA SYNC: Ensure categories and CCs are in the DB before processing values
        console.log(`[SYNC] Refreshing metadata for ${t.name}...`);
        try {
            const { syncData } = await import('./services');
            await syncData('DEFAULT', reqYear, 'competencia', t.id);
        } catch (e) {
            console.error(`[SYNC] Metadata refresh failed for ${t.name}:`, e);
        }

        const allEntityIds = await getAllVariantIds(t.id);
        
        const categoriesDb = await prisma.category.findMany({ 
            where: { tenantId: { in: allEntityIds } }, 
            select: { id: true, name: true } 
        });
        const costCentersDb = await prisma.costCenter.findMany({ 
            where: { tenantId: { in: allEntityIds } }, 
            select: { id: true } 
        });

        // ALIGNMENT MAPS: Raw ID -> Primary or Existing DB ID (CRITICAL for Grid Visibility)
        const catMap = new Map<string, string>();
        categoriesDb.forEach((cat: any) => {
            const raw = cat.id.includes(':') ? cat.id.split(':')[1] : cat.id;
            // Map both for absolute safety
            catMap.set(raw, cat.id);
            catMap.set(cat.id, cat.id);
        });

        const ccMap = new Map<string, string>();
        costCentersDb.forEach((cc: any) => {
            const raw = cc.id.includes(':') ? cc.id.split(':')[1] : cc.id;
            ccMap.set(raw, cc.id);
            ccMap.set(cc.id, cc.id);
        });

        for (const viewMode of ['competencia', 'caixa'] as const) {
            const isCaixa = viewMode === 'caixa';
            const startStr = reqYear === 2026 ? `2025-11-01` : `${reqYear}-01-01`; 
            const endStr = `${reqYear}-12-31`;
            const url1 = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=${startStr}&data_vencimento_ate=${endStr}&tamanho_pagina=100`;
            const url2 = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=${startStr}&data_vencimento_ate=${endStr}&tamanho_pagina=100`;

            const receivables = await fetchAllTransactionsForYear(token, url1, reqYear, viewMode, false);
            const payables = await fetchAllTransactionsForYear(token, url2, reqYear, viewMode, true);
            const allTxns = [...receivables, ...payables];

            let totalRevenue = 0;
            let totalExpense = 0;

            const aggregates = new Map<string, { amount: number, desc: string }>();
            const processedIds = new Set<string>();

            for (const txn of allTxns) {
                if (processedIds.has(txn.id)) continue;
                processedIds.add(txn.id);
                // Track total raw amounts for diagnostic
                if (txn.amount > 0) totalRevenue += Math.abs(txn.amount);
                else totalExpense += Math.abs(txn.amount);
                if (txn.categories.length === 0) continue;

                // No restrictive filters here anymore. We capture what the API gives us.

                const leaves = txn.categories.filter((c: any) => {
                    const cid = c.id;
                    return !txn.categories.some((other: any) => (other.category_parent_id === cid || other.parent_id === cid));
                });

                if (leaves.length === 0) leaves.push(txn.categories[0]);

                const catEntries = leaves.map((c: any) => {
                    const rawId = String(c.id);
                    const dbId = catMap.get(rawId);
                    const val = typeof c.valor === 'number' ? Math.abs(c.valor) : (txn.amount / leaves.length);
                    return { dbId, amount: val };
                });

                for (const cat of catEntries) {
                    if (!cat.dbId) continue;
                    
                    if (txn.costCenters.length === 0) {
                        const key = `${cat.dbId}|NONE|${txn.month}`;
                        if (!aggregates.has(key)) aggregates.set(key, { amount: 0, desc: txn.description || '' });
                        aggregates.get(key)!.amount += cat.amount;
                    } else {
                        let totalCcAllocated = 0;
                        let unallocatedCount = 0;
                        const ccSplits = txn.costCenters.map((cc: any) => {
                            let exp = null;
                            if (typeof cc.valor === 'number') exp = Math.abs(cc.valor);
                            else if (typeof cc.percentual === 'number') exp = cat.amount * (cc.percentual / 100);
                            if (exp !== null) totalCcAllocated += exp; else unallocatedCount++;
                            return { dbId: ccMap.get(String(cc.id)), amount: exp };
                        });
                        const rem = Math.max(0, cat.amount - totalCcAllocated);
                        const fallback = unallocatedCount > 0 ? (rem / unallocatedCount) : 0;
                        for (const cc of ccSplits) {
                            const ccId = cc.dbId || 'NONE';
                            const key = `${cat.dbId}|${ccId}|${txn.month}`;
                            if (!aggregates.has(key)) aggregates.set(key, { amount: 0, desc: txn.description || '' });
                            const val = cc.amount !== null ? cc.amount : (unallocatedCount > 0 ? fallback : (cat.amount / ccSplits.length));
                            aggregates.get(key)!.amount += val;
                        }
                    }
                }
            }

            pushLog(`[SYNC] [${t.name}] Aggregated ${aggregates.size} keys for ${viewMode}. Raw Revenue: ${totalRevenue.toFixed(2)}, Raw Expense: ${totalExpense.toFixed(2)}. Net: ${(totalRevenue - totalExpense).toFixed(2)}`);

            await prisma.realizedEntry.deleteMany({ where: { tenantId: { in: allEntityIds }, year: reqYear, viewMode } });
            
            const createData = Array.from(aggregates.entries()).map(([key, data]) => {
                const [catId, ccId, monthStr] = key.split('|');
                return {
                    tenantId: primaryId,
                    categoryId: catId,
                    costCenterId: ccId === 'NONE' ? null : ccId,
                    month: parseInt(monthStr, 10),
                    year: reqYear,
                    amount: data.amount,
                    viewMode
                };
            });

            if (createData.length > 0) {
                pushLog(`[SYNC] [${t.name}] Attempting to save ${createData.length} records to DB...`);
                try {
                    const res = await prisma.realizedEntry.createMany({ data: createData });
                    pushLog(`[SYNC] [${t.name}] SUCCESS: Saved ${res.count} records via createMany.`);
                } catch (e: any) {
                    pushLog(`[SYNC] [${t.name}] createMany FAILED: ${e.message}. Falling back to individual creation.`);
                    for (const row of createData) {
                        try { 
                            await prisma.realizedEntry.create({ data: row }); 
                        } catch (err: any) {
                            pushLog(`[SYNC] [${t.name}] Individual save FAILED for cat ${row.categoryId}: ${err.message}`);
                        }
                    }
                }
            } else {
                console.warn(`[SYNC] [${t.name}] NO DATA to save for ${viewMode}. Check filters/API response.`);
            }
        }
        report.push({ tenant: t.name, status: 'Success' });
    }
    return { success: true, year: reqYear, report, logs };
}
