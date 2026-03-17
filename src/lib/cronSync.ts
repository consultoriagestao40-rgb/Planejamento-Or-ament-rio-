import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';
import { getPrimaryTenantId, getAllVariantIds } from '@/lib/tenant-utils';
// V0.3.11-BYPASS-CACHE-1773618480

export async function fetchAllTransactionsForYear(accessToken: string, baseUrl: string, targetYear: number, viewMode: 'caixa' | 'competencia', isExpense = false) {
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

    const report = [];
    const cleanedGroups = new Set<string>(); // tenantId + viewMode + year

    for (const t of allTenants) {
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
            select: { id: true, name: true, tenantId: true } 
        });
        const costCentersDb = await prisma.costCenter.findMany({ 
            where: { tenantId: { in: allEntityIds } }, 
            select: { id: true, name: true, tenantId: true } 
        });

        // ALIGNMENT MAPS: Raw ID -> Primary or Existing DB ID (CRITICAL for Grid Visibility)
        const primaryCategories = categoriesDb.filter((c: any) => c.tenantId === primaryId);
        const primaryCCs = costCentersDb.filter((c: any) => (c as any).tenantId === primaryId);

        const catMap = new Map<string, string>();
        categoriesDb.forEach((cat: any) => {
            const raw = cat.id.includes(':') ? cat.id.split(':')[1] : cat.id;
            // Find primary equivalent by name and type
            const primary = primaryCategories.find(p => p.name.trim() === cat.name.trim());
            const targetId = primary?.id || cat.id;
            
            catMap.set(raw, targetId);
            catMap.set(cat.id, targetId);
        });

        const ccMap = new Map<string, string>();
        costCentersDb.forEach((cc: any) => {
            const raw = cc.id.includes(':') ? cc.id.split(':')[1] : cc.id;
            const primary = primaryCCs.find(p => p.name.trim() === (cc as any).name?.trim());
            const targetId = primary?.id || cc.id;

            ccMap.set(raw, targetId);
            ccMap.set(cc.id, targetId);
        });

        for (const viewMode of ['competencia', 'caixa'] as const) {
            const isCaixa = viewMode === 'caixa';
            const startStr = reqYear === 2026 ? `2025-11-01` : `${reqYear}-01-01`; 
            const endStr = `${reqYear}-12-31`;
            const url1 = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=${startStr}&data_vencimento_ate=${endStr}&tamanho_pagina=100`;
            const url2 = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=${startStr}&data_vencimento_ate=${endStr}&tamanho_pagina=100`;

            const receivables = (await fetchAllTransactionsForYear(token, url1, reqYear, viewMode, false)).map(tx => ({ ...tx, isExpense: false }));
            const payables = (await fetchAllTransactionsForYear(token, url2, reqYear, viewMode, true)).map(tx => ({ ...tx, isExpense: true }));
            const transactions = [...receivables, ...payables];

            let totalRevenue = 0;
            let totalExpense = 0;

            const aggregates = new Map<string, { amount: number, desc: string }>();
            const processedIds = new Set<string>();

            for (const txn of transactions) {
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

            pushLog(`[SYNC] [${t.name}] Raw Revenue: ${totalRevenue.toFixed(2)}, Raw Expense: ${totalExpense.toFixed(2)}. Net: ${(totalRevenue - totalExpense).toFixed(2)}`);

            const entriesToSave: any[] = [];
            for (const txn of transactions) {
                // Ensure we handle multiple categories per transaction
                for (const cat of txn.categories) {
                    const catId = catMap.get(String(cat.id));
                    if (!catId) continue;

                    let amount = Math.abs(cat.valor || (txn.amount / txn.categories.length));
                    
                    if (txn.costCenters && txn.costCenters.length > 0) {
                        let totalCcAllocated = 0;
                        let unallocatedCount = 0;
                        const ccSplits = txn.costCenters.map((cc: any) => {
                            let exp = null;
                            if (typeof cc.valor === 'number') exp = Math.abs(cc.valor);
                            else if (typeof cc.percentual === 'number') exp = amount * (cc.percentual / 100);
                            if (exp !== null) totalCcAllocated += exp; else unallocatedCount++;
                            return { dbId: ccMap.get(String(cc.id)), amount: exp };
                        });
                        const rem = Math.max(0, amount - totalCcAllocated);
                        const fallback = unallocatedCount > 0 ? (rem / unallocatedCount) : 0;

                        for (const cc of ccSplits) {
                            const ccId = cc.dbId || null;
                            const val = cc.amount !== null ? cc.amount : (unallocatedCount > 0 ? fallback : (amount / ccSplits.length));
                            
                            entriesToSave.push({
                                tenantId: primaryId,
                                categoryId: catId,
                                costCenterId: ccId,
                                month: txn.month,
                                year: reqYear,
                                amount: val,
                                viewMode,
                                description: txn.description || 'Sem descrição',
                                externalId: `${txn.id}-${cat.id}-${cc.id || 'NONE'}`
                            });
                        }
                    } else {
                        entriesToSave.push({
                            tenantId: primaryId,
                            categoryId: catId,
                            costCenterId: null,
                            month: txn.month,
                            year: reqYear,
                            amount: amount,
                            viewMode,
                            description: txn.description || 'Sem descrição',
                            externalId: `${txn.id}-${cat.id}-G`
                        });
                    }
                }
            }

            if (entriesToSave.length > 0) {
                pushLog(`[SYNC] [${t.name}] Attempting to save ${entriesToSave.length} individual transactions to DB...`);
                try {
                    // 1. Targetted cleanup: only ONCE per primary group
                    const cleanupKey = `${primaryId}|${viewMode}|${reqYear}`;
                    if (!cleanedGroups.has(cleanupKey)) {
                        pushLog(`[SYNC] [${t.name}] First variant of group detected (${t.id}). Cleaning up ALL related variant records for ${primaryId}/${reqYear}/${viewMode}...`);
                        
                        // We use allEntityIds here because we want to wipe anything that might have been saved 
                        // under variant IDs in the past (v0.9.11 and earlier).
                        const deleted = await prisma.realizedEntry.deleteMany({ 
                            where: { 
                                tenantId: { in: allEntityIds }, 
                                year: reqYear, 
                                viewMode 
                            } 
                        });
                        pushLog(`[SYNC] [${t.name}] Deleted ${deleted.count} legacy/variant records.`);
                        cleanedGroups.add(cleanupKey);
                    }

                    // 2. Bulk insert
                    const res = await (prisma.realizedEntry as any).createMany({ 
                        data: entriesToSave,
                        skipDuplicates: true 
                    });
                    pushLog(`[SYNC] [${t.name}] SUCCESS: Saved ${res.count} records using createMany.`);
                } catch (e: any) {
                    pushLog(`[SYNC] [${t.name}] createMany FAILED: ${e.message}. Falling back to individual UPSERTs.`);
                    let successCount = 0;
                    let failCount = 0;
                    for (const row of entriesToSave) {
                        try { 
                            await (prisma.realizedEntry as any).upsert({
                                where: { 
                                    externalId_viewMode_tenantId: { 
                                        externalId: row.externalId, 
                                        viewMode: row.viewMode,
                                        tenantId: row.tenantId
                                    } 
                                },
                                update: row,
                                create: row
                            });
                            successCount++;
                        } catch (err: any) {
                            failCount++;
                        }
                    }
                    pushLog(`[SYNC] [${t.name}] Individual sync finished: ${successCount} success, ${failCount} failed.`);
                }
            } else {
                pushLog(`[SYNC] [${t.name}] WARNING: No data filtered for 2026. Check API content.`);
            }
        }
        report.push({ tenant: t.name, status: 'Success' });
    }
    return { success: true, year: reqYear, report, logs };
}
