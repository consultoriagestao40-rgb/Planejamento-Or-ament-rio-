import { prisma } from '@/lib/prisma';
import { getValidAccessToken } from '@/lib/services';
import { getPrimaryTenantId, getAllVariantIds } from '@/lib/tenant-utils';

async function fetchAllTransactionsForYear(accessToken: string, baseUrl: string, targetYear: number, viewMode: 'caixa' | 'competencia') {
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

                if (viewMode === 'caixa') {
                    dateStr = item.data_pagamento || item.baixado_em || item.data_vencimento || item.vencimento;
                    const status = (item.status || '').toUpperCase();
                    const isPaid = status === 'BAIXADO' || status === 'RECEBIDO' || status === 'PAGO' || status === 'QUITADO' || (item.pago && item.pago > 0) || (item.valor_pago && item.valor_pago > 0);
                    if (!isPaid) continue;
                    amount = item.pago || item.valor_pago || item.valor || item.amount || item.total || 0;
                } else {
                    dateStr = item.data_competencia || item.data_vencimento || item.vencimento;
                    amount = item.pago || item.valor_pago || item.valor || item.amount || item.total || 0;
                }

                const dateObj = dateStr ? new Date(dateStr) : new Date();
                if (dateObj.getFullYear() !== targetYear) continue;

                transactions.push({
                    id: item.id,
                    description: item.descricao,
                    month: dateObj.getMonth(),
                    amount: Math.abs(amount),
                    categories: cats,
                    costCenters: ccs
                });
            }

            if (items.length < 100) hasMore = false;
            else page++;
        } catch (e) {
            hasMore = false;
        }
    }
    return transactions;
}

export async function runCronSync(reqYear: number, targetTenantId?: string) {
    let allTenants;
    if (targetTenantId && targetTenantId !== 'ALL') {
        allTenants = await prisma.tenant.findMany({ where: { id: targetTenantId } });
    } else {
        allTenants = await prisma.tenant.findMany({ orderBy: { updatedAt: 'desc' } });
    }

    if (allTenants.length === 0) return { success: false, error: 'No tenants' };

    // DEDUPLICATE: Memory-based by CNPJ or Normalized Name
    const companyMap = new Map();
    allTenants.forEach(t => {
        const cleanCnpj = (t.cnpj || '').replace(/\D/g, '');
        const cleanName = (t.name || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        const key = cleanCnpj !== '' ? cleanCnpj : cleanName;
        if (!companyMap.has(key) || new Date(t.updatedAt) > new Date(companyMap.get(key).updatedAt)) {
            companyMap.set(key, t);
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
        
        const primaryId = t.id;
        const allEntityIds = await getAllVariantIds(t.id);
        
        const categoriesDb = await prisma.category.findMany({ 
            where: { tenantId: { in: allEntityIds } }, 
            select: { id: true, name: true } 
        });
        const costCentersDb = await prisma.costCenter.findMany({ 
            where: { tenantId: { in: allEntityIds } }, 
            select: { id: true } 
        });

        // ALIGNMENT MAPS: Raw ID -> Existing DB ID (to ensure Grid matches)
        const catMap = new Map<string, string>();
        categoriesDb.forEach((c: any) => {
            const raw = c.id.includes(':') ? c.id.split(':')[1] : c.id;
            if (!catMap.has(raw)) catMap.set(raw, c.id);
        });

        const ccMap = new Map<string, string>();
        costCentersDb.forEach((cc: any) => {
            const raw = cc.id.includes(':') ? cc.id.split(':')[1] : cc.id;
            if (!ccMap.has(raw)) ccMap.set(raw, cc.id);
        });

        for (const viewMode of ['competencia', 'caixa'] as const) {
            const isCaixa = viewMode === 'caixa';
            const startStr = isCaixa ? `${reqYear}-01-01` : `${reqYear - 1}-07-01`;
            const endStr = isCaixa ? `${reqYear}-12-31` : `${reqYear + 1}-06-30`;
            const dateParam = isCaixa ? 'data_pagamento' : 'data_vencimento';

            const url1 = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?${dateParam}_de=${startStr}&${dateParam}_ate=${endStr}&tamanho_pagina=100`;
            const url2 = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?${dateParam}_de=${startStr}&${dateParam}_ate=${endStr}&tamanho_pagina=100`;

            const receivables = await fetchAllTransactionsForYear(token, url1, reqYear, viewMode);
            const payables = await fetchAllTransactionsForYear(token, url2, reqYear, viewMode);
            const allTxns = [...receivables, ...payables];

            const aggregates = new Map<string, { amount: number, desc: string }>();
            const processedIds = new Set<string>();

            for (const txn of allTxns) {
                if (processedIds.has(txn.id)) continue;
                processedIds.add(txn.id);
                if (txn.categories.length === 0) continue;

                // RULE: Only Revenue (starts with 01)
                const isRevenue = txn.categories.some((c: any) => {
                    const name = (c.nome || c.name || '').trim();
                    return name.startsWith('01');
                });
                if (!isRevenue) continue;

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
                    description: data.desc,
                    viewMode
                };
            });

            if (createData.length > 0) {
                try {
                    await prisma.realizedEntry.createMany({ data: createData });
                } catch (e) {
                    for (const row of createData) {
                        try { await prisma.realizedEntry.create({ data: row }); } catch (err) {}
                    }
                }
            }
        }
        report.push({ tenant: t.name, status: 'Success' });
    }
    return { success: true, year: reqYear, report };
}
