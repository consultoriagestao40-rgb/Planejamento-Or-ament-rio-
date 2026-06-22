import { prisma } from './prisma';

// Helper para execução paralela com limite de concorrência
async function fetchInParallelWithLimit<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>
): Promise<R[]> {
    const results: Promise<R>[] = [];
    const executing: Promise<any>[] = [];
    let delay = 0;
    for (const item of items) {
        const currentDelay = delay;
        delay += 150; // Espaçar o início de cada requisição em 150ms (máximo ~6.6 requisições por segundo)
        
        const p = Promise.resolve()
            .then(() => new Promise(resolve => setTimeout(resolve, currentDelay)))
            .then(() => fn(item));
            
        results.push(p);
        if (limit <= items.length) {
            const e: any = p.then(() => executing.splice(executing.indexOf(e), 1));
            executing.push(e);
            if (executing.length >= limit) {
                await Promise.race(executing);
            }
        }
    }
    return Promise.all(results);
}

// Helper de Autenticação
export async function getValidAccessToken(tenantId?: string) {
    const tenant = tenantId
        ? await prisma.tenant.findUnique({ where: { id: tenantId } })
        : await prisma.tenant.findFirst();

    if (!tenant) throw new Error("No connected tenant found");

    if (tenant.accessToken === 'test-token') {
        throw new Error("⚠️ MODO DE TESTE: Use o botão Azul para conectar.");
    }

    if (tenant.tokenExpiresAt && new Date(tenant.tokenExpiresAt).getTime() < Date.now() + 5 * 60 * 1000) {
        if (!tenant.refreshToken) throw new Error("Refresh token missing");
        const clientId = process.env.CONTA_AZUL_CLIENT_ID;
        const clientSecret = process.env.CONTA_AZUL_CLIENT_SECRET;
        const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

        const res = await fetch('https://auth.contaazul.com/oauth2/token', {
            method: 'POST',
            headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tenant.refreshToken })
        });

        if (res.ok) {
            const newToken = await res.json();
            await prisma.tenant.update({
                where: { id: tenant.id },
                data: {
                    accessToken: newToken.access_token,
                    refreshToken: newToken.refresh_token,
                    tokenExpiresAt: new Date(Date.now() + newToken.expires_in * 1000)
                }
            });
            return { token: newToken.access_token, tenant };
        } else {
            const errBody = await res.text();
            console.error(`[AUTH] Refresh failed for ${tenant.id}:`, errBody);
            throw new Error(`Conexão expirada com Conta Azul (Refresh Failed). Por favor, reconecte a empresa.`);
        }
    }
    return { token: tenant.accessToken, tenant };
}

// Lógica de Sincronização Simplificada (Versão de Estabilização)
export async function fetchRealizedValues(accessToken: string, targetYear: number, costCenterId: string, viewMode: 'caixa' | 'competencia' = 'competencia', tenantId: string): Promise<Record<string, number>> {
    const values: Record<string, number> = {};
    const isCaixa = viewMode === 'caixa';
    const startStr = `${targetYear}-01-01`;
    const endStr = `${targetYear}-12-31`;
    
    const dateParam = isCaixa ? 'data_pagamento' : 'data_competencia';
    
    const urls = [
        `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=${targetYear-3}-01-01&data_vencimento_ate=${targetYear+3}-12-31&${dateParam}_de=${startStr}&${dateParam}_ate=${endStr}&tamanho_pagina=100`,
        `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=${targetYear-3}-01-01&data_vencimento_ate=${targetYear+3}-12-31&${dateParam}_de=${startStr}&${dateParam}_ate=${endStr}&tamanho_pagina=100`,
        `https://api-v2.contaazul.com/v1/venda/busca?data_inicio=${startStr}&data_fim=${endStr}&tamanho_pagina=100`
    ];

    for (const url of urls) {
        await aggregateTransactions(accessToken, url, values, url.includes('pagar'), costCenterId, targetYear, viewMode, tenantId);
    }

    return values;
}

export async function syncRealizedEntries(
    tenantId: string,
    year: number,
    viewMode: 'caixa' | 'competencia' = 'competencia',
    startMonth: number = 1,
    endMonth: number = 12
) {
    // Garantir que categorias (como PDD) e centros de custo estejam atualizados no banco de dados
    try {
        await syncMasterData(tenantId);
    } catch (err) {
        console.warn(`[Sync] Falha ao atualizar dados mestre de categorias/centros de custo para o tenant ${tenantId}:`, err);
    }

    const { token } = await getValidAccessToken(tenantId);

    const entriesToSave: any[] = [];

    // Busca mês a mês para maior precisão e controle
    for (let month = startMonth; month <= endMonth; month++) {
        const paddedMonth = month.toString().padStart(2, '0');
        const startStr = `${year}-${paddedMonth}-01`;
        // Último dia do mês
        const lastDay = new Date(year, month, 0).getDate();
        const endStr = `${year}-${paddedMonth}-${lastDay}`;
        const dateParam = viewMode === 'caixa' ? 'data_pagamento' : 'data_competencia';

        const urls = [
            `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=${year-3}-01-01&data_vencimento_ate=${year+3}-12-31&${dateParam}_de=${startStr}&${dateParam}_ate=${endStr}&tamanho_pagina=100`,
            `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?data_vencimento_de=${year-3}-01-01&data_vencimento_ate=${year+3}-12-31&${dateParam}_de=${startStr}&${dateParam}_ate=${endStr}&tamanho_pagina=100`,
            `https://api-v2.contaazul.com/v1/venda/busca?data_inicio=${startStr}&data_fim=${endStr}&tamanho_pagina=100`
        ];

        if (viewMode === 'competencia') {
            // Busca complementar para capturar títulos com status de perda (LOST) para fins de PDD
            urls.push(`https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?data_vencimento_de=${year}-01-01&data_vencimento_ate=${year}-12-31&status=LOST&tamanho_pagina=100`);
        }

        const monthEntries: any[] = [];
        for (const url of urls) {
            await collectDetailedTransactions(token, url, monthEntries, url.includes('pagar'), year, viewMode, tenantId, month);
        }

        // --- NEW LOGIC: Dynamic tax retentions from Vendas module ---
        // Desativado para manter equivalência exata com o DRE do Conta Azul
        // if (viewMode === 'competencia' && (tenantId === 'dc2b6eed-a38a-43c3-9465-ce854bfda90f' || tenantId === '413f88a7-ce4a-4620-b044-43ef909b7b26')) {
        //     await collectRetentionsFromSales(token, tenantId, year, month, monthEntries, viewMode);
        // }

        entriesToSave.push(...monthEntries);
    }

    // ⚠️ PROTEÇÃO CRÍTICA: Apaga SOMENTE registros que vieram da API (externalId LIKE 'sync-%')
    // dentro do intervalo de meses solicitado. Dados do Excel (externalId = NULL) NUNCA são tocados.
    await prisma.realizedEntry.deleteMany({
        where: {
            tenantId,
            year,
            viewMode,
            month: { gte: startMonth, lte: endMonth },
            externalId: { startsWith: 'sync-' }
        }
    });

    if (entriesToSave.length > 0) {
        // --- PREVENT FOREIGN KEY CONSTRAINTS (CostCenter) ---
        const ccIdsToVerify = Array.from(new Set(
            entriesToSave
                .map(e => e.costCenterId)
                .filter((id): id is string => !!id)
        ));
        if (ccIdsToVerify.length > 0) {
            const existingCCs = await prisma.costCenter.findMany({
                where: { id: { in: ccIdsToVerify } },
                select: { id: true }
            });
            const existingCCIds = new Set(existingCCs.map(cc => cc.id));
            const missingCCIds = ccIdsToVerify.filter(id => !existingCCIds.has(id));

            if (missingCCIds.length > 0) {
                const ccsToCreate = missingCCIds.map(id => ({
                    id,
                    name: `Não Identificado (${id.substring(0, 8)})`,
                    tenantId
                }));
                await prisma.costCenter.createMany({
                    data: ccsToCreate,
                    skipDuplicates: true
                });
            }
        }

        // --- PREVENT FOREIGN KEY CONSTRAINTS (Category) ---
        const catIdsToVerify = Array.from(new Set(
            entriesToSave
                .map(e => e.categoryId)
                .filter((id): id is string => !!id)
        ));
        if (catIdsToVerify.length > 0) {
            const existingCats = await prisma.category.findMany({
                where: { id: { in: catIdsToVerify } },
                select: { id: true }
            });
            const existingCatIds = new Set(existingCats.map(cat => cat.id));
            const missingCatIds = catIdsToVerify.filter(id => !existingCatIds.has(id));

            if (missingCatIds.length > 0) {
                const catsToCreate = missingCatIds.map(id => ({
                    id,
                    name: `Outras Despesas (${id.substring(0, 8)})`,
                    tenantId,
                    type: 'OTHER'
                }));
                await prisma.category.createMany({
                    data: catsToCreate,
                    skipDuplicates: true
                });
            }
        }

        await prisma.realizedEntry.createMany({ data: entriesToSave, skipDuplicates: true });
    }

    return { success: true, count: entriesToSave.length, months: `${startMonth}-${endMonth}` };
}

async function collectDetailedTransactions(
    accessToken: string,
    url: string,
    entries: any[],
    isExpense: boolean,
    targetYear: number,
    viewMode: string,
    tenantId: string,
    targetMonth: number
) {
    let pagina = 1;
    let hasMore = true;
    
    while (hasMore) {
        const pagedUrl = `${url}&pagina=${pagina}`;
        const res = await fetch(pagedUrl, { 
            headers: { 'Authorization': `Bearer ${accessToken}` },
            cache: 'no-store'
        });
        
        if (!res.ok) {
            const errBody = await res.text().catch(() => '');
            const endpointName = url.split('/v1/')[1]?.split('?')[0] || 'api';
            throw new Error(`[Conta Azul API] ${endpointName} retornou status ${res.status}: ${errBody}`);
        }
        
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.itens || data.vendas || []);
        if (items.length === 0) break;

        // --- PRE-FETCH PARCEL DETAILS IN PARALLEL WITH LIMIT ---
        const idsToFetch = items
            .filter((item: any) => {
                if (!item.id) return false;
                const isLoss = item.status === 'LOST' || item.status === 'PERDIDO';
                const cats = item.categorias || (item.categoria ? [item.categoria] : []);
                const hasMultipleCats = cats.length > 1;
                return isLoss || hasMultipleCats;
            })
            .map((item: any) => item.id);

        const parcelDetailsMap = new Map<string, any>();
        if (idsToFetch.length > 0) {
            const details = await fetchInParallelWithLimit(idsToFetch, 4, async (id) => {
                try {
                    const detailUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/parcelas/${id}`;
                    const detailRes = await fetch(detailUrl, {
                        headers: { 'Authorization': `Bearer ${accessToken}` },
                        cache: 'no-store'
                    });
                    if (detailRes.ok) {
                        return { id, data: await detailRes.json() };
                    }
                } catch (err) {
                    console.warn(`[Sync] Falha ao pré-buscar parcelas para ${id}:`, err);
                }
                return { id, data: null };
            });
            for (const d of details) {
                if (d.data) {
                    parcelDetailsMap.set(d.id, d.data);
                }
            }
        }

        for (const item of items) {
            const categories = item.categorias || (item.categoria ? [item.categoria] : []);
            
            // Identificar se a transação possui status de perda (LOST ou PERDIDO)
            const isLossItem = item.status === 'LOST' || item.status === 'PERDIDO';

            // Identificar se a transação possui categoria correspondente a PDD/Perda (Grupo 06.8)
            const hasPDD = categories.some((c: any) => {
                const name = (c.nome || c.name || '').toLowerCase();
                const id = (c.id || c.categoria_id || '').toLowerCase();
                return name.includes('pdd') || name.includes('perda') || name.startsWith('06.8') || id.includes('06.8');
            });

            // Se for a busca complementar de perdas, processamos APENAS os itens que de fato viraram perda (LOST/PERDIDO)
            const isLossQuery = viewMode === 'competencia' && url.includes('status=LOST') && !isExpense;
            if (isLossQuery && !isLossItem) {
                continue;
            }

            // Tratamento especial para itens de perda (PDD)
            if (isLossItem) {
                try {
                    const detailData = parcelDetailsMap.get(item.id);
                    if (detailData) {
                        const lossInfo = detailData.perda || detailData.evento?.perda || null;
                        
                        if (lossInfo && lossInfo.data) {
                            const lossDate = new Date(lossInfo.data);
                            
                            // Se a data de baixa da perda for no mês/ano alvo, criamos o lançamento de PDD
                            if (lossDate.getFullYear() === targetYear && (lossDate.getMonth() + 1) === targetMonth) {
                                // Buscar a categoria de PDD (Grupo 06.8) do tenant no banco
                                const lossCat = await prisma.category.findFirst({
                                    where: {
                                        tenantId,
                                        OR: [
                                            { name: { startsWith: '06.8' } },
                                            { name: { contains: 'Perdas' } },
                                            { name: { contains: 'PDD' } }
                                        ]
                                    }
                                });
                                
                                const lossCatId = lossCat?.id || `${tenantId}:06.8.1`;
                                const clientName = (item.cliente?.nome || item.fornecedor?.nome || '').trim();
                                const description = (item.descricao || item.description || 'Baixa por Perda (PDD)').trim();
                                const lossAmount = Math.abs(lossInfo.valor || amount || 0);

                                entries.push({
                                    tenantId,
                                    categoryId: lossCatId,
                                    costCenterId: null,
                                    month: targetMonth,
                                    year: targetYear,
                                    amount: lossAmount,
                                    viewMode,
                                    externalId: `sync-${tenantId}-${item.id}-pdd-${viewMode}`,
                                    description: `${description} (Baixa por Perda)`,
                                    customer: clientName || null,
                                    date: lossDate
                                });
                            }
                        }
                    }
                } catch (err) {
                    console.warn(`[Sync] Falha ao sincronizar detalhe de perda da parcela ${item.id}:`, err);
                }
                
                // Se for a busca complementar de perdas, o item já foi tratado e podemos pular
                if (isLossQuery) {
                    continue;
                }
            }

            const amount = (item.pago !== undefined && item.nao_pago !== undefined)
                ? (item.pago + item.nao_pago)
                : (item.valor_total || item.total || item.valor || item.pago || 0);
            
            // Para PDD, a data que define o reconhecimento contábil na competência é a data da baixa/pagamento da perda
            const dateStr = hasPDD
                ? (item.data_baixa || item.data_pagamento || item.data_competencia || item.data_emissao || item.data)
                : (item.data_competencia || item.data_emissao || item.venda_em || item.data_pagamento || item.data);

            if (!dateStr) continue;
            const dateObj = new Date(dateStr);
            if (dateObj.getFullYear() !== targetYear) continue;
            if (dateObj.getMonth() + 1 !== targetMonth) continue;

            const ccs = item.centros_de_custo || [];
            
            if (categories.length > 0) {
                let processedSplits = false;
                if (categories.length > 1 && item.id) {
                    try {
                        const detailData = parcelDetailsMap.get(item.id);
                        if (detailData) {
                            const rateios = detailData.evento?.rateio || detailData.rateio || [];
                            if (rateios.length > 0) {
                                let ratIdx = 0;
                                for (const rat of rateios) {
                                    const catName = rat.nome_categoria || '';
                                    if (viewMode === 'competencia' && isNonDRECategory(catName, tenantId)) {
                                        continue;
                                    }

                                    let catId = rat.id_categoria;
                                    if (!catId) continue;
                                    
                                    const catValue = (rat.valor_bruto !== undefined && rat.valor_bruto !== null) ? rat.valor_bruto : (rat.valor || 0);

                                    // Mapear IDs de produção para IDs do banco (com prefixo de tenant) para a JVS Facilities
                                    if (tenantId === 'dc2b6eed-a38a-43c3-9465-ce854bfda90f') {
                                        const mapping: Record<string, string> = {
                                            'a5e9a3c0-464b-4ee8-97c2-41589c16cb39': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:ff1133d9-438c-418f-9fbd-7aaea606c089',
                                            'df8e2be4-bc1a-43e6-abcf-e11bdc2166f6': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:cb3d9d47-39e8-4121-ae9b-85a2de798f0f',
                                            'c3c491af-26f8-4260-9958-64222c73dffd': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:2093bcb6-0696-4eb3-81ba-54b4bf32d6df',
                                            '23b9c662-feca-4284-a11d-39bce5c233fc': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:0f74ee3e-ed1e-4df8-9672-270873dc22b9',
                                            'dc7a9e89-0965-4252-9f50-78d3e3affb5f': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:757c1323-acb2-49b8-bc92-e23673f228dd',
                                            'c5e21dd4-2c92-4ca5-a180-0fdd138166a7': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:094007e9-2b81-4b65-b7c5-468e356f73ea',
                                            'd5c2b0a7-72cf-4770-bb7a-b1a56a24e0af': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:a0c0556d-0326-4209-9ee6-794d6850214c',
                                            '184e5b87-77df-4eae-942c-840a58a15f05': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:0523cd73-ac23-4b3e-827c-d60c8ef3377c',
                                            'c7a31d42-bd04-4f76-9dfa-d561b7c0cebf': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:36b7a96b-6cac-4c9f-a7ac-9de8774f5b95',
                                            'd22c9581-ec57-4141-b66f-08632dae7749': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:909681ce-2877-4240-9694-2ef6e8d38472',
                                            '1d018eed-24a5-42d3-986b-3b77726da7d4': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:9403a15f-6e38-4e66-bd7f-f45504c9aad7',
                                            '3f61dfba-0dbf-44b6-8d17-864ad3b719cd': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:4dbc02ba-db1e-47ce-9ba8-c3cc07d01659',
                                            'ef8ee1b0-f0d0-446a-8a28-dbd8df16b852': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:58736492-9937-4b52-b10f-247fdbbc49ad',
                                            '24108198-ba94-4e14-bef6-1d4c63255a7d': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:8ff72ab7-c678-4170-a7dd-c2b328079fc7',
                                            'ebcecc1e-c840-4ef0-b31c-0eb150d4fde1': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:edc92b2c-cdb0-44d5-bc69-2055b9365860',
                                            '3e51d9eb-ea68-4624-9ea7-ac5af12f452c': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:e88cba21-a650-4796-9b6c-574968222933',
                                            '4f3e8d55-a7f2-4361-9af9-1b2dbf8f0c78': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:72c69d1c-db65-4ae0-a6d9-8fc3c83ccd5b',
                                            '1452e2b7-3968-4370-9173-412736e4d1df': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:1452e2b7-3968-4370-9173-412736e4d1df',
                                            '514d81fe-c366-4714-8243-39bbb4bc9e55': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:5405d46e-a1f0-45cf-a30c-634d13d7a28b'
                                        };
                                        if (mapping[catId]) catId = mapping[catId];
                                    }

                                    const ratCcs = rat.rateio_centro_custo || [];
                                    const clientName = (item.cliente?.nome || item.fornecedor?.nome || '').trim();
                                    const description = (item.descricao || item.description || rat.nome_categoria || '').trim();

                                    const addDetailedEntry = (ccId: string | null, val: number, suffix: string) => {
                                        entries.push({
                                            tenantId,
                                            categoryId: catId,
                                            costCenterId: (ccId === 'NONE' || !ccId) ? null : (ccId.includes(':') ? ccId : `${tenantId}:${ccId}`),
                                            month: targetMonth,
                                            year: targetYear,
                                            amount: val,
                                            viewMode,
                                            externalId: `sync-${tenantId}-${item.id}-split-${ratIdx}-${suffix}-${viewMode}`,
                                            description: description || `Split: ${catName}`,
                                            customer: clientName || null,
                                            date: dateObj
                                        });
                                    };

                                    const isFineToReclassify = false; // Desativada reclassificação para manter integridade

                                    if (!isFineToReclassify) {
                                        if (ratCcs.length === 0) {
                                            addDetailedEntry(null, catValue, 'NONE');
                                        } else {
                                            ratCcs.forEach((rc: any) => {
                                                const ccId = rc.id_centro_custo;
                                                const percent = (rc.percentual || (100 / ratCcs.length)) / 100;
                                                
                                                let ccValue = 0;
                                                const isFinancialOrFine = catName.startsWith('06.') || catId === '769ce5a9-1d15-4d5f-aad8-3795e0902364';
                                                
                                                if (viewMode === 'competencia') {
                                                    if (isFinancialOrFine) {
                                                        const descUpper = (description || '').toUpperCase();
                                                        const isCardPayment = catName.startsWith('06.7') && (descUpper.includes('FATURA') || descUpper.includes('PAG.FATURA'));
                                                        
                                                        if (isCardPayment) {
                                                            ccValue = 0;
                                                        } else {
                                                            const isPaid = item.status === 'ACQUITTED' || (item.pago !== undefined && item.pago !== null && item.pago > 0) || (item.valor_pago !== undefined && item.valor_pago !== null && item.valor_pago > 0);
                                                            ccValue = isPaid ? (catValue * percent) : 0;
                                                        }
                                                    } else {
                                                        ccValue = catValue * percent;
                                                    }
                                                } else {
                                                    ccValue = ((rc.valor !== undefined && rc.valor !== null) ? rc.valor : (catValue * percent));
                                                }
                                                
                                                addDetailedEntry(ccId, ccValue, ccId || 'NONE');
                                            });
                                        }
                                    }

                                    // --- RECLASSIFICAÇÃO DE MULTAS NO CUSTO (CLEAN TECH) ---
                                    if (isFineToReclassify) {
                                        const mainCatToUse = categories[0];
                                        const mainCatId = mainCatToUse.id || mainCatToUse.categoria_id;
                                        if (mainCatId) {
                                            const addDuplicatedDetailedEntry = (ccId: string | null, val: number, suffix: string) => {
                                                entries.push({
                                                    tenantId,
                                                    categoryId: mainCatId,
                                                    costCenterId: (ccId === 'NONE' || !ccId) ? null : (ccId.includes(':') ? ccId : `${tenantId}:${ccId}`),
                                                    month: targetMonth,
                                                    year: targetYear,
                                                    amount: val,
                                                    viewMode,
                                                    externalId: `sync-${tenantId}-${item.id}-split-dup-${ratIdx}-${suffix}-${viewMode}`,
                                                    description: `${description || 'Multa'} (Reclassificado Custo)`,
                                                    customer: clientName || null,
                                                    date: dateObj
                                                });
                                            };

                                            if (ratCcs.length === 0) {
                                                addDuplicatedDetailedEntry(null, catValue, 'NONE');
                                            } else {
                                                ratCcs.forEach((rc: any) => {
                                                    const ccId = rc.id_centro_custo;
                                                    const percent = (rc.percentual || (100 / ratCcs.length)) / 100;
                                                    const ccValue = viewMode === 'competencia'
                                                        ? (catValue * percent)
                                                        : ((rc.valor !== undefined && rc.valor !== null) ? rc.valor : (catValue * percent));
                                                    addDuplicatedDetailedEntry(ccId, ccValue, ccId || 'NONE');
                                                });
                                            }
                                        }
                                    }

                                    ratIdx++;
                                }
                                processedSplits = true;
                            }
                        }
                    } catch (e) {
                        console.warn(`[Conta Azul API] Error fetching details for split parcel ${item.id}:`, e);
                    }
                }

                if (!processedSplits) {
                    const catToUse = categories[0];
                    const catName = catToUse.nome || catToUse.name || '';
                    let catId = catToUse.id || catToUse.categoria_id;
                    
                    if (viewMode === 'competencia') {
                        if (isNonDRECategory(catName, tenantId)) {
                            continue;
                        }
                        
                        const isFinancialOrFine = catName.startsWith('06.') || catId === '769ce5a9-1d15-4d5f-aad8-3795e0902364';
                        if (isFinancialOrFine) {
                            const descUpper = (item.descricao || item.description || '').toUpperCase();
                            const isCardPayment = catName.startsWith('06.7') && (descUpper.includes('FATURA') || descUpper.includes('PAG.FATURA'));
                            
                            if (isCardPayment) {
                                continue;
                            }
                            
                            const isPaid = item.status === 'ACQUITTED' || (item.pago !== undefined && item.pago !== null && item.pago > 0) || (item.valor_pago !== undefined && item.valor_pago !== null && item.valor_pago > 0);
                            if (!isPaid) {
                                continue;
                            }
                        }
                    }
                    
                    // Mapear IDs de produção para IDs do banco (com prefixo de tenant) para a JVS Facilities
                    if (tenantId === 'dc2b6eed-a38a-43c3-9465-ce854bfda90f') {
                        const mapping: Record<string, string> = {
                            'a5e9a3c0-464b-4ee8-97c2-41589c16cb39': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:ff1133d9-438c-418f-9fbd-7aaea606c089',
                            'df8e2be4-bc1a-43e6-abcf-e11bdc2166f6': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:cb3d9d47-39e8-4121-ae9b-85a2de798f0f',
                            'c3c491af-26f8-4260-9958-64222c73dffd': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:2093bcb6-0696-4eb3-81ba-54b4bf32d6df',
                            '23b9c662-feca-4284-a11d-39bce5c233fc': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:0f74ee3e-ed1e-4df8-9672-270873dc22b9',
                            'dc7a9e89-0965-4252-9f50-78d3e3affb5f': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:757c1323-acb2-49b8-bc92-e23673f228dd',
                            'c5e21dd4-2c92-4ca5-a180-0fdd138166a7': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:094007e9-2b81-4b65-b7c5-468e356f73ea',
                            'd5c2b0a7-72cf-4770-bb7a-b1a56a24e0af': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:a0c0556d-0326-4209-9ee6-794d6850214c',
                            '184e5b87-77df-4eae-942c-840a58a15f05': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:0523cd73-ac23-4b3e-827c-d60c8ef3377c',
                            'c7a31d42-bd04-4f76-9dfa-d561b7c0cebf': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:36b7a96b-6cac-4c9f-a7ac-9de8774f5b95',
                            'd22c9581-ec57-4141-b66f-08632dae7749': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:909681ce-2877-4240-9694-2ef6e8d38472',
                            '1d018eed-24a5-42d3-986b-3b77726da7d4': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:9403a15f-6e38-4e66-bd7f-f45504c9aad7',
                            '3f61dfba-0dbf-44b6-8d17-864ad3b719cd': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:4dbc02ba-db1e-47ce-9ba8-c3cc07d01659',
                            'ef8ee1b0-f0d0-446a-8a28-dbd8df16b852': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:58736492-9937-4b52-b10f-247fdbbc49ad',
                            '24108198-ba94-4e14-bef6-1d4c63255a7d': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:8ff72ab7-c678-4170-a7dd-c2b328079fc7',
                            'ebcecc1e-c840-4ef0-b31c-0eb150d4fde1': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:edc92b2c-cdb0-44d5-bc69-2055b9365860',
                            '3e51d9eb-ea68-4624-9ea7-ac5af12f452c': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:e88cba21-a650-4796-9b6c-574968222933',
                            '4f3e8d55-a7f2-4361-9af9-1b2dbf8f0c78': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:72c69d1c-db65-4ae0-a6d9-8fc3c83ccd5b',
                            '1452e2b7-3968-4370-9173-412736e4d1df': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:1452e2b7-3968-4370-9173-412736e4d1df',
                            '514d81fe-c366-4714-8243-39bbb4bc9e55': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:5405d46e-a1f0-45cf-a30c-634d13d7a28b'
                        };
                        if (mapping[catId]) catId = mapping[catId];
                    }
                    const catValue = amount;
                    const clientName = (item.cliente?.nome || item.fornecedor?.nome || '').trim();
                    const description = (item.descricao || item.description || '').trim();

                    const addDetailedEntry = (ccId: string | null, val: number, suffix: string) => {
                        entries.push({
                            tenantId,
                            categoryId: catId,
                            costCenterId: (ccId === 'NONE' || !ccId) ? null : (ccId.includes(':') ? ccId : `${tenantId}:${ccId}`),
                            month: targetMonth,
                            year: targetYear,
                            amount: val,
                            viewMode,
                            externalId: `sync-${tenantId}-${item.id}-${catId}-${suffix}-${viewMode}`,
                            description: description || `Lançamento: ${catName}`,
                            customer: clientName || null,
                            date: dateObj
                        });
                    };

                    if (ccs.length === 0) {
                        addDetailedEntry(null, catValue, 'NONE');
                    } else {
                        ccs.forEach((c: any) => {
                            const ccId = c.id;
                            const percent = (c.percentual || (100 / ccs.length)) / 100;
                            addDetailedEntry(ccId, catValue * percent, ccId || 'NONE');
                        });
                    }
                }
            }
        }
        
        if (items.length < 100) hasMore = false;
        pagina++;
    }
}

async function collectRetentionsFromSales(
    accessToken: string,
    tenantId: string,
    year: number,
    month: number,
    entries: any[],
    viewMode: string
) {
    const paddedMonth = month.toString().padStart(2, '0');
    const startStr = `${year}-${paddedMonth}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endStr = `${year}-${paddedMonth}-${lastDay}`;
    
    let pagina = 1;
    let hasMore = true;
    
    const taxCatId = `${tenantId}:02.01.03`;

    while (hasMore) {
        const url = `https://api-v2.contaazul.com/v1/venda/busca?data_inicio=${startStr}&data_fim=${endStr}&tamanho_pagina=100&pagina=${pagina}`;
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            cache: 'no-store'
        });

        if (!res.ok) {
            const errBody = await res.text().catch(() => '');
            throw new Error(`[Conta Azul API] venda/busca retornou status ${res.status}: ${errBody}`);
        }

        const data = await res.json();
        const items = data.vendas || data.itens || data || [];
        if (items.length === 0) break;

        // --- PRE-FETCH SALES DETAILS IN PARALLEL WITH LIMIT ---
        const salesToFetch = items.filter((item: any) => item.id && !(item.status || '').toUpperCase().includes('CANCEL'));
        const salesDetailsMap = new Map<string, any>();
        if (salesToFetch.length > 0) {
            const details = await fetchInParallelWithLimit(salesToFetch, 4, async (item: any) => {
                try {
                    const detailUrl = `https://api-v2.contaazul.com/v1/venda/${item.id}`;
                    const detailRes = await fetch(detailUrl, {
                        headers: { 'Authorization': `Bearer ${accessToken}` },
                        cache: 'no-store'
                    });
                    if (detailRes.ok) {
                        return { id: item.id, data: await detailRes.json() };
                    }
                } catch (err) {
                    console.warn(`[Sync] Falha ao pré-buscar venda ${item.id}:`, err);
                }
                return { id: item.id, data: null };
            });
            for (const d of details) {
                if (d.data) {
                    salesDetailsMap.set(d.id, d.data);
                }
            }
        }

        for (const item of items) {
            if ((item.status || '').toUpperCase().includes('CANCEL')) continue;
            
            const detailData = salesDetailsMap.get(item.id);
            const sale = detailData ? (detailData.venda || detailData) : null;
            if (!sale) continue;

            const compVal = sale.composicao_valor || {};
            const totalRet = compVal.impostos || 0;
            
            if (totalRet > 0) {
                const saleCatId = sale.id_categoria || 'a5e9a3c0-464b-4ee8-97c2-41589c16cb39';
                let mappedRevenueCatId = saleCatId;
                
                // Mapear se for JVS Facilities
                if (tenantId === 'dc2b6eed-a38a-43c3-9465-ce854bfda90f') {
                    const mapping: Record<string, string> = {
                        'a5e9a3c0-464b-4ee8-97c2-41589c16cb39': 'ff1133d9-438c-418f-9fbd-7aaea606c089', // 01.1.1 - Serviços Vendidos
                        'df8e2be4-bc1a-43e6-abcf-e11bdc2166f6': 'cb3d9d47-39e8-4121-ae9b-85a2de798f0f', // 01.1.2 - Serviços Extras
                        'c3c491af-26f8-4260-9958-64222c73dffd': '2093bcb6-0696-4eb3-81ba-54b4bf32d6df', // 01.2.1 - Receitas de Vendas
                    };
                    if (mapping[mappedRevenueCatId]) mappedRevenueCatId = mapping[mappedRevenueCatId];
                }

                if (mappedRevenueCatId && !mappedRevenueCatId.startsWith(tenantId)) {
                    mappedRevenueCatId = `${tenantId}:${mappedRevenueCatId}`;
                }

                const ccId = sale.id_centro_custo || null;
                const clientName = (sale.cliente?.nome || sale.cliente_nome || '').trim();
                const saleNum = sale.numero || '';
                const description = `Retenção Imposto Fonte (Venda ${saleNum})`.trim();
                const saleDate = sale.data_emissao || sale.data_venda || sale.venda_em || sale.data || `${year}-${paddedMonth}-01`;
                const dateObj = new Date(saleDate);

                // Add revenue retention entry
                entries.push({
                    tenantId,
                    categoryId: mappedRevenueCatId,
                    costCenterId: !ccId ? null : (ccId.includes(':') ? ccId : `${tenantId}:${ccId}`),
                    month,
                    year,
                    amount: totalRet,
                    viewMode,
                    externalId: `sync-${tenantId}-${sale.id}-ret-rev-${viewMode}`,
                    description: `Recomposição Faturamento Bruto (Retenções Venda ${saleNum})`,
                    customer: clientName || null,
                    date: dateObj
                });

                // Add tax retention entry
                entries.push({
                    tenantId,
                    categoryId: taxCatId,
                    costCenterId: !ccId ? null : (ccId.includes(':') ? ccId : `${tenantId}:${ccId}`),
                    month,
                    year,
                    amount: totalRet,
                    viewMode,
                    externalId: `sync-${tenantId}-${sale.id}-ret-tax-${viewMode}`,
                    description: description,
                    customer: clientName || null,
                    date: dateObj
                });
            }
        }

        if (items.length < 100) hasMore = false;
        else pagina++;
    }
}


export async function syncMasterData(tenantId: string) {
    const { token } = await getValidAccessToken(tenantId);
    
    // Sync Categories
    try {
        let pagina = 1;
        let hasMore = true;
        while (hasMore) {
            const catRes = await fetch(`https://api-v2.contaazul.com/v1/categorias?tamanho_pagina=100&pagina=${pagina}`, { 
                headers: { 'Authorization': `Bearer ${token}` },
                cache: 'no-store'
            });
            if (catRes.ok) {
                const data = await catRes.json();
                const items = data.itens || [];
                if (items.length === 0) break;
                
                for (const item of items) {
                    const existing = await prisma.category.findUnique({ where: { id: item.id } });
                    let finalName = item.name;
                    if (existing) {
                        const isLocalInactive = existing.name.toUpperCase().includes('[INATIVO]');
                        const isRemoteInactive = item.name.toUpperCase().includes('[INATIVO]');
                        if (isLocalInactive && !isRemoteInactive) {
                            finalName = `[INATIVO] ${item.name}`;
                        }
                    }

                    await (prisma.category as any).upsert({
                        where: { id: item.id },
                        update: { name: finalName, parentId: item.categoria_pai?.id },
                        create: { id: item.id, name: finalName, tenantId, parentId: item.categoria_pai?.id, type: 'OTHER' }
                    });
                }
                
                if (items.length < 100) hasMore = false;
                pagina++;
            } else {
                hasMore = false;
            }
        }
    } catch (e) {}

    // Sync Cost Centers
    try {
        let pagina = 1;
        let hasMore = true;
        while (hasMore) {
            const ccRes = await fetch(`https://api-v2.contaazul.com/v1/centros-de-custo?tamanho_pagina=100&pagina=${pagina}`, { 
                headers: { 'Authorization': `Bearer ${token}` },
                cache: 'no-store'
            });
            if (ccRes.ok) {
                const data = await ccRes.json();
                const items = Array.isArray(data) ? data : (data.itens || []);
                if (items.length === 0) break;

                for (const item of items) {
                    const existing = await prisma.costCenter.findUnique({ where: { id: item.id } });
                    let finalName = item.name;
                    if (existing) {
                        const isLocalInactive = existing.name.toUpperCase().includes('[INATIVO]');
                        const isRemoteInactive = item.name.toUpperCase().includes('[INATIVO]');
                        if (isLocalInactive && !isRemoteInactive) {
                            finalName = `[INATIVO] ${item.name}`;
                        }
                    }

                    const prefixedId = item.id.includes(':') ? item.id : `${tenantId}:${item.id}`;
                    await (prisma.costCenter as any).upsert({
                        where: { id: prefixedId },
                        update: { name: finalName },
                        create: { id: prefixedId, name: finalName, tenantId }
                    });
                }

                if (items.length < 100) hasMore = false;
                pagina++;
            } else {
                hasMore = false;
            }
        }
    } catch (e) {}

    return { success: true };
}

function isNonDRECategory(name: string, tenantId: string): boolean {
    const norm = (name || '').trim();
    
    // Frete recebido 06.1.8 é duplicidade de faturamento de vendas no Grupo 01, por isso é excluído para todas as empresas
    if (norm.startsWith('06.1.8')) {
        return true;
    }

    return false;
}

async function aggregateTransactions(accessToken: string, url: string, targetValues: Record<string, number>, isExpense: boolean, costCenterIdString: string, targetYear: number, viewMode: string, tenantId: string) {
    let pagina = 1;
    let hasMore = true;
    
    while (hasMore) {
        const pagedUrl = `${url}&pagina=${pagina}`;
        const res = await fetch(pagedUrl, { 
            headers: { 'Authorization': `Bearer ${accessToken}` },
            cache: 'no-store'
        });
        
        if (!res.ok) {
            const errBody = await res.text().catch(() => '');
            const endpointName = url.split('/v1/')[1]?.split('?')[0] || 'api';
            throw new Error(`[Conta Azul API] ${endpointName} retornou status ${res.status}: ${errBody}`);
        }
        
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.itens || data.vendas || []);
        if (items.length === 0) break;

        for (const item of items) {
            const amount = item.valor_total || item.total || item.valor || item.pago || 0;
            const dateStr = item.data_competencia || item.data_emissao || item.venda_em || item.data_pagamento || item.data;
            if (!dateStr) continue;
            const dateObj = new Date(dateStr);
            if (dateObj.getFullYear() !== targetYear) continue;

            const monthIdx = dateObj.getMonth();
            const ccs = item.centros_de_custo || [];
            const categories = item.categorias || (item.categoria ? [item.categoria] : []);
            
            if (categories.length > 0) {
                let processedSplits = false;
                if (categories.length > 1 && item.id) {
                    try {
                        const detailUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/parcelas/${item.id}`;
                        const detailRes = await fetch(detailUrl, {
                            headers: { 'Authorization': `Bearer ${accessToken}` },
                            cache: 'no-store'
                        });
                        if (detailRes.ok) {
                            const detailData = await detailRes.json();
                            const rateios = detailData.evento?.rateio || detailData.rateio || [];
                            if (rateios.length > 0) {
                                for (const rat of rateios) {
                                    const catName = rat.nome_categoria || '';
                                    if (viewMode === 'competencia' && isNonDRECategory(catName, tenantId)) {
                                        continue;
                                    }

                                    let catId = rat.id_categoria;
                                    if (!catId) continue;
                                    
                                    const catValue = (rat.valor_bruto !== undefined && rat.valor_bruto !== null) ? rat.valor_bruto : (rat.valor || 0);

                                    // Mapear IDs de produção para IDs do banco (com prefixo de tenant) para a JVS Facilities
                                    if (tenantId === 'dc2b6eed-a38a-43c3-9465-ce854bfda90f') {
                                        const mapping: Record<string, string> = {
                                            'a5e9a3c0-464b-4ee8-97c2-41589c16cb39': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:ff1133d9-438c-418f-9fbd-7aaea606c089',
                                            'df8e2be4-bc1a-43e6-abcf-e11bdc2166f6': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:cb3d9d47-39e8-4121-ae9b-85a2de798f0f',
                                            'c3c491af-26f8-4260-9958-64222c73dffd': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:2093bcb6-0696-4eb3-81ba-54b4bf32d6df',
                                            '23b9c662-feca-4284-a11d-39bce5c233fc': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:0f74ee3e-ed1e-4df8-9672-270873dc22b9',
                                            'dc7a9e89-0965-4252-9f50-78d3e3affb5f': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:757c1323-acb2-49b8-bc92-e23673f228dd',
                                            'c5e21dd4-2c92-4ca5-a180-0fdd138166a7': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:094007e9-2b81-4b65-b7c5-468e356f73ea',
                                            'd5c2b0a7-72cf-4770-bb7a-b1a56a24e0af': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:a0c0556d-0326-4209-9ee6-794d6850214c',
                                            '184e5b87-77df-4eae-942c-840a58a15f05': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:0523cd73-ac23-4b3e-827c-d60c8ef3377c',
                                            'c7a31d42-bd04-4f76-9dfa-d561b7c0cebf': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:36b7a96b-6cac-4c9f-a7ac-9de8774f5b95',
                                            'd22c9581-ec57-4141-b66f-08632dae7749': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:909681ce-2877-4240-9694-2ef6e8d38472',
                                            '1d018eed-24a5-42d3-986b-3b77726da7d4': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:9403a15f-6e38-4e66-bd7f-f45504c9aad7',
                                            '3f61dfba-0dbf-44b6-8d17-864ad3b719cd': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:4dbc02ba-db1e-47ce-9ba8-c3cc07d01659',
                                            'ef8ee1b0-f0d0-446a-8a28-dbd8df16b852': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:58736492-9937-4b52-b10f-247fdbbc49ad',
                                            '24108198-ba94-4e14-bef6-1d4c63255a7d': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:8ff72ab7-c678-4170-a7dd-c2b328079fc7',
                                            'ebcecc1e-c840-4ef0-b31c-0eb150d4fde1': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:edc92b2c-cdb0-44d5-bc69-2055b9365860',
                                            '3e51d9eb-ea68-4624-9ea7-ac5af12f452c': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:e88cba21-a650-4796-9b6c-574968222933',
                                            '4f3e8d55-a7f2-4361-9af9-1b2dbf8f0c78': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:72c69d1c-db65-4ae0-a6d9-8fc3c83ccd5b',
                                            '1452e2b7-3968-4370-9173-412736e4d1df': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:1452e2b7-3968-4370-9173-412736e4d1df',
                                            '514d81fe-c366-4714-8243-39bbb4bc9e55': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:5405d46e-a1f0-45cf-a30c-634d13d7a28b'
                                        };
                                        if (mapping[catId]) catId = mapping[catId];
                                    }

                                    const ratCcs = rat.rateio_centro_custo || [];
                                    const isFineToReclassify = false; // Desativada reclassificação para manter integridade

                                    if (!isFineToReclassify) {
                                        if (ratCcs.length === 0) {
                                            const key = `${catId}|NONE-${monthIdx}`;
                                            targetValues[key] = (targetValues[key] || 0) + catValue;
                                        } else {
                                            ratCcs.forEach((rc: any) => {
                                                const ccId = rc.id_centro_custo;
                                                const percent = (rc.percentual || (100 / ratCcs.length)) / 100;
                                                
                                                let ccValue = 0;
                                                const isFinancialOrFine = catName.startsWith('06.') || catId === '769ce5a9-1d15-4d5f-aad8-3795e0902364';
                                                
                                                if (viewMode === 'competencia') {
                                                    if (isFinancialOrFine) {
                                                        const descUpper = (description || '').toUpperCase();
                                                        const isCardPayment = catName.startsWith('06.7') && (descUpper.includes('FATURA') || descUpper.includes('PAG.FATURA'));
                                                        
                                                        if (isCardPayment) {
                                                            ccValue = 0;
                                                        } else {
                                                            const isPaid = item.status === 'ACQUITTED' || (item.pago !== undefined && item.pago !== null && item.pago > 0) || (item.valor_pago !== undefined && item.valor_pago !== null && item.valor_pago > 0);
                                                            ccValue = isPaid ? (catValue * percent) : 0;
                                                        }
                                                    } else {
                                                        ccValue = catValue * percent;
                                                    }
                                                } else {
                                                    ccValue = ((rc.valor !== undefined && rc.valor !== null) ? rc.valor : (catValue * percent));
                                                }
                                                
                                                const key = `${catId}|${ccId}-${monthIdx}`;
                                                targetValues[key] = (targetValues[key] || 0) + ccValue;
                                            });
                                        }
                                    }

                                    // --- RECLASSIFICAÇÃO DE MULTAS NO CUSTO (CLEAN TECH) ---
                                    if (isFineToReclassify) {
                                        const mainCatToUse = categories[0];
                                        const mainCatId = mainCatToUse.id || mainCatToUse.categoria_id;
                                        if (mainCatId) {
                                            if (ratCcs.length === 0) {
                                                const key = `${mainCatId}|NONE-${monthIdx}`;
                                                targetValues[key] = (targetValues[key] || 0) + catValue;
                                            } else {
                                                ratCcs.forEach((rc: any) => {
                                                    const ccId = rc.id_centro_custo;
                                                    const percent = (rc.percentual || (100 / ratCcs.length)) / 100;
                                                    const ccValue = viewMode === 'competencia'
                                                        ? (catValue * percent)
                                                        : ((rc.valor !== undefined && rc.valor !== null) ? rc.valor : (catValue * percent));
                                                    const key = `${mainCatId}|${ccId}-${monthIdx}`;
                                                    targetValues[key] = (targetValues[key] || 0) + ccValue;
                                                });
                                            }
                                        }
                                    }
                                }
                                processedSplits = true;
                            }
                        }
                    } catch (e) {
                        console.warn(`[Conta Azul API] Error fetching details for split parcel ${item.id}:`, e);
                    }
                }

                if (!processedSplits) {
                    const catToUse = categories[0];
                    const catName = catToUse.nome || catToUse.name || '';
                    let catId = catToUse.id || catToUse.categoria_id;
                    
                    if (viewMode === 'competencia') {
                        if (isNonDRECategory(catName, tenantId)) {
                            continue;
                        }
                        
                        const isFinancialOrFine = catName.startsWith('06.') || catId === '769ce5a9-1d15-4d5f-aad8-3795e0902364';
                        if (isFinancialOrFine) {
                            const descUpper = (item.descricao || item.description || '').toUpperCase();
                            const isCardPayment = catName.startsWith('06.7') && (descUpper.includes('FATURA') || descUpper.includes('PAG.FATURA'));
                            
                            if (isCardPayment) {
                                continue;
                            }
                            
                            const isPaid = item.status === 'ACQUITTED' || (item.pago !== undefined && item.pago !== null && item.pago > 0) || (item.valor_pago !== undefined && item.valor_pago !== null && item.valor_pago > 0);
                            if (!isPaid) {
                                continue;
                            }
                        }
                    }
                    
                    // Mapear IDs de produção para IDs do banco (com prefixo de tenant) para a JVS Facilities
                    if (tenantId === 'dc2b6eed-a38a-43c3-9465-ce854bfda90f') {
                        const mapping: Record<string, string> = {
                            // Receitas
                            'a5e9a3c0-464b-4ee8-97c2-41589c16cb39': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:ff1133d9-438c-418f-9fbd-7aaea606c089', // 01.1.1 - Serviços Vendidos
                            'df8e2be4-bc1a-43e6-abcf-e11bdc2166f6': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:cb3d9d47-39e8-4121-ae9b-85a2de798f0f', // 01.1.2 - Serviços Extras
                            'c3c491af-26f8-4260-9958-64222c73dffd': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:2093bcb6-0696-4eb3-81ba-54b4bf32d6df', // 01.2.1 - Receitas de Vendas

                            // Custos Operacionais (03)
                            '23b9c662-feca-4284-a11d-39bce5c233fc': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:0f74ee3e-ed1e-4df8-9672-270873dc22b9', // 03.1.1 - Salários
                            'dc7a9e89-0965-4252-9f50-78d3e3affb5f': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:757c1323-acb2-49b8-bc92-e23673f228dd', // 03.2.1 - Recolhimento FGTS
                            'c5e21dd4-2c92-4ca5-a180-0fdd138166a7': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:094007e9-2b81-4b65-b7c5-468e356f73ea', // 03.3.1 - Vale Transporte
                            'd5c2b0a7-72cf-4770-bb7a-b1a56a24e0af': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:a0c0556d-0326-4209-9ee6-794d6850214c', // 03.3.2 - Vale Alimentação
                            '184e5b87-77df-4eae-942c-840a58a15f05': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:0523cd73-ac23-4b3e-827c-d60c8ef3377c', // 03.4.1 - Diária Serviço Vendido
                            'c7a31d42-bd04-4f76-9dfa-d561b7c0cebf': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:36b7a96b-6cac-4c9f-a7ac-9de8774f5b95', // 03.4.2 - Diária Coberturas

                            // Despesas Operacionais (04)
                            'd22c9581-ec57-4141-b66f-08632dae7749': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:909681ce-2877-4240-9694-2ef6e8d38472', // 04.8.1 - Pagamento de Mensalidade de Terceiros

                            // Despesas Administrativas (05)
                            '1d018eed-24a5-42d3-986b-3b77726da7d4': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:9403a15f-6e38-4e66-bd7f-f45504c9aad7', // 05.6.1 - Pró-labore
                            '3f61dfba-0dbf-44b6-8d17-864ad3b719cd': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:4dbc02ba-db1e-47ce-9ba8-c3cc07d01659', // 05.12.1 - Software / Licença de Uso

                            // Despesas/Entradas Financeiras (06)
                            'ef8ee1b0-f0d0-446a-8a28-dbd8df16b852': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:58736492-9937-4b52-b10f-247fdbbc49ad', // 06.1.1 - Transferência entre CNPJ
                            '24108198-ba94-4e14-bef6-1d4c63255a7d': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:8ff72ab7-c678-4170-a7dd-c2b328079fc7', // 06.1.2 - Transferencia entre Contas
                            'ebcecc1e-c840-4ef0-b31c-0eb150d4fde1': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:edc92b2c-cdb0-44d5-bc69-2055b9365860', // 06.2.1 - Transferencia entre CNPJ (Saída)
                            '3e51d9eb-ea68-4624-9ea7-ac5af12f452c': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:e88cba21-a650-4796-9b6c-574968222933', // 06.2.2 - Transferencia entre conta (Saída)
                            '4f3e8d55-a7f2-4361-9af9-1b2dbf8f0c78': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:72c69d1c-db65-4ae0-a6d9-8fc3c83ccd5b', // 06.4.1 - Tarifas/Juros/Multas

                            // Tributos (02)
                            '1452e2b7-3968-4370-9173-412736e4d1df': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:1452e2b7-3968-4370-9173-412736e4d1df', // 2.1.1 - Simples Nacional - DAS
                            '514d81fe-c366-4714-8243-39bbb4bc9e55': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:5405d46e-a1f0-45cf-a30c-634d13d7a28b'  // 2.1.2 - Sefaz
                        };
                        if (mapping[catId]) catId = mapping[catId];
                    }
                    const catValue = amount;

                    if (ccs.length === 0) {
                        const key = `${catId}|NONE-${monthIdx}`;
                        targetValues[key] = (targetValues[key] || 0) + catValue;
                    } else {
                        ccs.forEach((c: any) => {
                            const ccId = c.id;
                            const percent = (c.percentual || (100 / ccs.length)) / 100;
                            const key = `${catId}|${ccId}-${monthIdx}`;
                            targetValues[key] = (targetValues[key] || 0) + (catValue * percent);
                        });
                    }
                }
            }
        }
        
        if (items.length < 100) hasMore = false;
        pagina++;
    }
}

async function addRetentionsFromSales(accessToken: string, tenantId: string, year: number, month: number, monthValues: Record<string, number>) {
    const paddedMonth = month.toString().padStart(2, '0');
    const startStr = `${year}-${paddedMonth}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endStr = `${year}-${paddedMonth}-${lastDay}`;
    
    let pagina = 1;
    let hasMore = true;
    
    const taxCatId = `${tenantId}:02.01.03`;
    const monthIdx = month - 1;

    while (hasMore) {
        const url = `https://api-v2.contaazul.com/v1/venda/busca?data_inicio=${startStr}&data_fim=${endStr}&tamanho_pagina=100&pagina=${pagina}`;
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            cache: 'no-store'
        });

        if (!res.ok) {
            const errBody = await res.text().catch(() => '');
            throw new Error(`[Conta Azul API] venda/busca retornou status ${res.status}: ${errBody}`);
        }

        const data = await res.json();
        const items = data.vendas || data.itens || data || [];
        if (items.length === 0) break;

        for (const item of items) {
            if ((item.status || '').toUpperCase().includes('CANCEL')) continue;
            
            // Fetch detailed sale info to get the composicao_valor and exact taxes/retentions
            const detailUrl = `https://api-v2.contaazul.com/v1/venda/${item.id}`;
            const detailRes = await fetch(detailUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` },
                cache: 'no-store'
            });

            if (!detailRes.ok) {
                console.warn(`[Conta Azul API] Falha ao buscar detalhes da venda ${item.id}: status ${detailRes.status}`);
                continue;
            }

            const detailData = await detailRes.json();
            const sale = detailData.venda || detailData;
            if (!sale) continue;

            const compVal = sale.composicao_valor || {};
            const totalRet = compVal.impostos || 0;
            
            if (totalRet > 0) {
                const saleCatId = sale.id_categoria || 'a5e9a3c0-464b-4ee8-97c2-41589c16cb39';
                let mappedRevenueCatId = saleCatId;
                
                // Mapear se for JVS Facilities
                if (tenantId === 'dc2b6eed-a38a-43c3-9465-ce854bfda90f') {
                    const mapping: Record<string, string> = {
                        'a5e9a3c0-464b-4ee8-97c2-41589c16cb39': 'ff1133d9-438c-418f-9fbd-7aaea606c089', // 01.1.1 - Serviços Vendidos
                        'df8e2be4-bc1a-43e6-abcf-e11bdc2166f6': 'cb3d9d47-39e8-4121-ae9b-85a2de798f0f', // 01.1.2 - Serviços Extras
                        'c3c491af-26f8-4260-9958-64222c73dffd': '2093bcb6-0696-4eb3-81ba-54b4bf32d6df', // 01.2.1 - Receitas de Vendas
                    };
                    if (mapping[mappedRevenueCatId]) mappedRevenueCatId = mapping[mappedRevenueCatId];
                }

                if (mappedRevenueCatId && !mappedRevenueCatId.startsWith(tenantId)) {
                    mappedRevenueCatId = `${tenantId}:${mappedRevenueCatId}`;
                }

                const ccId = sale.id_centro_custo || 'NONE';

                const revKey = `${mappedRevenueCatId}|${ccId}-${monthIdx}`;
                const taxKey = `${taxCatId}|${ccId}-${monthIdx}`;
                
                monthValues[revKey] = (monthValues[revKey] || 0) + totalRet;
                monthValues[taxKey] = (monthValues[taxKey] || 0) + totalRet;
            }
        }

        if (items.length < 100) hasMore = false;
        else pagina++;
    }
}

export async function syncBankAccounts(tenantId: string, accessToken: string) {
    console.log(`[Sync Bank Accounts] Sincronizando contas financeiras para tenant ${tenantId}...`);
    try {
        // Tentar obter a lista de contas financeiras da API v2
        const res = await fetch(`https://api-v2.contaazul.com/v1/conta-financeira`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            cache: 'no-store'
        });
        
        let items: any[] = [];
        if (res.ok) {
            const data = await res.json();
            items = data.itens || data || [];
        } else {
            console.warn(`[Sync Bank Accounts] Falha ao obter contas financeiras: status ${res.status}. Usando fallback.`);
        }

        if (items.length > 0) {
            // Filtrar apenas contas ativas para consultar o saldo
            const activeItems = items.filter((item: any) => item.ativo);
            
            // Consultar saldo de cada conta ativa em paralelo (limite de concorrência 5)
            const accountsWithBalance = await fetchInParallelWithLimit(activeItems, 5, async (item: any) => {
                let balance = 0;
                try {
                    const balanceRes = await fetch(`https://api-v2.contaazul.com/v1/conta-financeira/${item.id}/saldo-atual`, {
                        headers: { 'Authorization': `Bearer ${accessToken}` },
                        cache: 'no-store'
                    });
                    if (balanceRes.ok) {
                        const balanceData = await balanceRes.json();
                        balance = balanceData.saldo_atual !== undefined ? balanceData.saldo_atual : (balanceData.saldo || 0);
                    }
                } catch (e: any) {
                    console.warn(`[Sync Bank Accounts] Erro ao buscar saldo da conta ${item.name} (${item.id}): ${e.message}`);
                }
                return {
                    id: item.id,
                    name: item.nome || item.name || 'Conta Bancária',
                    balance: parseFloat(balance.toString())
                };
            });

            for (const acc of accountsWithBalance) {
                await (prisma.bankAccount as any).upsert({
                    where: { id: acc.id },
                    update: {
                        name: acc.name,
                        balance: acc.balance,
                    },
                    create: {
                        id: acc.id,
                        name: acc.name,
                        balance: acc.balance,
                        tenantId
                    }
                });
            }
            console.log(`[Sync Bank Accounts] Sincronizadas ${accountsWithBalance.length} contas financeiras ativas com saldos reais.`);
        } else {
            // Fallback: verificar se já existem contas no banco
            const existingAccounts = await (prisma.bankAccount as any).findMany({
                where: { tenantId }
            });

            if (existingAccounts.length === 0) {
                // Criar conta padrão se nenhuma existir
                let fallbackId = 'default-bank-account';
                let fallbackName = 'Conta Principal';
                
                if (tenantId === 'dc2b6eed-a38a-43c3-9465-ce854bfda90f') {
                    fallbackId = '4dd329df-b400-46ec-a509-eb27d543c7d1';
                    fallbackName = 'Bradesco Facilities';
                }

                await (prisma.bankAccount as any).create({
                    data: {
                        id: fallbackId,
                        name: fallbackName,
                        balance: 0,
                        tenantId
                    }
                });
                console.log(`[Sync Bank Accounts] Criada conta financeira padrão de fallback: ${fallbackName}`);
            } else {
                console.log(`[Sync Bank Accounts] Contas financeiras existentes preservadas no banco.`);
            }
        }
    } catch (err: any) {
        console.warn(`[Sync Bank Accounts] Erro durante sincronização: ${err.message}. Ignorando erro para não abortar o sync de transações.`);
    }
}

export async function syncOpenCommitments(tenantId: string, accessToken: string, year: number) {
    console.log(`[Sync Open Commitments] Sincronizando contas a receber/pagar previstas para tenant ${tenantId} (ano de vencimento: ${year-1} a ${year+2})...`);
    
    // Deletar previsto_receber e previsto_pagar antigos
    await prisma.realizedEntry.deleteMany({
        where: {
            tenantId,
            viewMode: { in: ['previsto_receber', 'previsto_pagar'] }
        }
    });

    const entriesToSave: any[] = [];
    const startStr = `${year - 1}-01-01`;
    const endStr = `${year + 2}-12-31`;

    // 1. Contas a Receber (Em aberto)
    const recUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?status=PENDING&data_vencimento_de=${startStr}&data_vencimento_ate=${endStr}&tamanho_pagina=100`;
    await collectOpenTransactions(accessToken, recUrl, entriesToSave, false, tenantId);

    // 2. Contas a Receber (Perdas / LOST) - opcional para trazer inadimplências
    const lostUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?status=LOST&data_vencimento_de=${startStr}&data_vencimento_ate=${endStr}&tamanho_pagina=100`;
    await collectOpenTransactions(accessToken, lostUrl, entriesToSave, false, tenantId, true);

    // 3. Contas a Pagar (Em aberto)
    const payUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?status=PENDING&data_vencimento_de=${startStr}&data_vencimento_ate=${endStr}&tamanho_pagina=100`;
    await collectOpenTransactions(accessToken, payUrl, entriesToSave, true, tenantId);

    if (entriesToSave.length > 0) {
        // Garantir FK de Cost Center
        const ccIds = Array.from(new Set(entriesToSave.map(e => e.costCenterId).filter(Boolean)));
        for (const ccId of ccIds) {
            const exists = await prisma.costCenter.findUnique({ where: { id: ccId } });
            if (!exists) {
                await prisma.costCenter.create({
                    data: {
                        id: ccId,
                        name: `Não Identificado (${ccId.substring(0, 8)})`,
                        tenantId
                    }
                });
            }
        }

        // Garantir FK de Category
        const catIds = Array.from(new Set(entriesToSave.map(e => e.categoryId).filter(Boolean)));
        for (const catId of catIds) {
            const exists = await prisma.category.findUnique({ where: { id: catId } });
            if (!exists) {
                await prisma.category.create({
                    data: {
                        id: catId,
                        name: `Outras Despesas (${catId.substring(0, 8)})`,
                        tenantId,
                        type: 'OTHER'
                    }
                });
            }
        }

        await prisma.realizedEntry.createMany({
            data: entriesToSave,
            skipDuplicates: true
        });
    }

    console.log(`[Sync Open Commitments] Concluído. Salvos ${entriesToSave.length} registros previstos.`);
}

async function collectOpenTransactions(
    accessToken: string,
    url: string,
    entries: any[],
    isExpense: boolean,
    tenantId: string,
    isLost: boolean = false
) {
    let pagina = 1;
    let hasMore = true;
    const viewMode = isExpense ? 'previsto_pagar' : 'previsto_receber';

    while (hasMore) {
        const pagedUrl = `${url}&pagina=${pagina}`;
        const res = await fetch(pagedUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            cache: 'no-store'
        });
        if (!res.ok) {
            const errBody = await res.text().catch(() => '');
            console.error(`[Sync Open Commitments] Erro ao buscar títulos: status ${res.status}: ${errBody}`);
            break;
        }
        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.itens || data.vendas || []);
        if (items.length === 0) break;

        // --- PRE-FETCH PARCEL DETAILS IN PARALLEL WITH LIMIT ---
        const idsToFetch = items
            .filter((item: any) => item.id && (item.categorias || (item.categoria ? [item.categoria] : [])).length > 1)
            .map((item: any) => item.id);
        const parcelDetailsMap = new Map<string, any>();
        if (idsToFetch.length > 0) {
            const details = await fetchInParallelWithLimit(idsToFetch, 4, async (id) => {
                try {
                    const detailUrl = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/parcelas/${id}`;
                    const detailRes = await fetch(detailUrl, {
                        headers: { 'Authorization': `Bearer ${accessToken}` },
                        cache: 'no-store'
                    });
                    if (detailRes.ok) {
                        return { id, data: await detailRes.json() };
                    }
                } catch (err) {
                    console.warn(`[Sync] Falha ao pré-buscar parcelas previstas para ${id}:`, err);
                }
                return { id, data: null };
            });
            for (const d of details) {
                if (d.data) {
                    parcelDetailsMap.set(d.id, d.data);
                }
            }
        }

        for (const item of items) {
            const categories = item.categorias || (item.categoria ? [item.categoria] : []);
            const amount = item.valor_total || item.total || item.valor || 0;
            const dateStr = item.data_vencimento || item.due_date;
            if (!dateStr) continue;

            const dateObj = new Date(dateStr);
            const clientName = (item.cliente?.nome || item.fornecedor?.nome || '').trim();
            const description = (item.descricao || item.description || (isLost ? 'Inadimplência / Perda' : '')).trim();

            const ccs = item.centros_de_custo || [];
            
            // Tratamento de Rateio
            if (categories.length > 1 && item.id) {
                try {
                    const detailData = parcelDetailsMap.get(item.id);
                    if (detailData) {
                        const rateios = detailData.evento?.rateio || detailData.rateio || [];
                        if (rateios.length > 0) {
                            let ratIdx = 0;
                            for (const rat of rateios) {
                                let catId = rat.id_categoria;
                                if (!catId) continue;

                                if (tenantId === 'dc2b6eed-a38a-43c3-9465-ce854bfda90f') {
                                    const mapping: Record<string, string> = {
                                        'a5e9a3c0-464b-4ee8-97c2-41589c16cb39': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:ff1133d9-438c-418f-9fbd-7aaea606c089',
                                        'df8e2be4-bc1a-43e6-abcf-e11bdc2166f6': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:cb3d9d47-39e8-4121-ae9b-85a2de798f0f',
                                        'c3c491af-26f8-4260-9958-64222c73dffd': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:2093bcb6-0696-4eb3-81ba-54b4bf32d6df',
                                        '23b9c662-feca-4284-a11d-39bce5c233fc': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:0f74ee3e-ed1e-4df8-9672-270873dc22b9',
                                    };
                                    if (mapping[catId]) catId = mapping[catId];
                                }
                                if (!catId.startsWith(tenantId) && catId.length < 36) {
                                    catId = `${tenantId}:${catId}`;
                                }

                                const catValue = rat.valor || (amount / rateios.length);
                                const ratCcs = rat.rateio_centro_custo || [];

                                const addEntry = (ccId: string | null, val: number, suffix: string) => {
                                    entries.push({
                                        tenantId,
                                        categoryId: catId,
                                        costCenterId: ccId,
                                        month: dateObj.getMonth() + 1,
                                        year: dateObj.getFullYear(),
                                        amount: val,
                                        viewMode,
                                        externalId: `sync-${tenantId}-${item.id}-prev-split-${ratIdx}-${suffix}`,
                                        description: description || `Rateio Previsto`,
                                        customer: clientName || null,
                                        date: dateObj
                                    });
                                };

                                if (ratCcs.length === 0) {
                                    addEntry(null, catValue, 'NONE');
                                } else {
                                    ratCcs.forEach((rc: any) => {
                                        const ccId = rc.id_centro_custo;
                                        const percent = (rc.percentual || (100 / ratCcs.length)) / 100;
                                        addEntry(ccId, catValue * percent, ccId || 'NONE');
                                    });
                                }
                                ratIdx++;
                            }
                            continue;
                        }
                    }
                } catch (err) {
                    console.warn(`[Sync Open Commitments] Erro ao carregar parcelas rateadas para ${item.id}:`, err);
                }
            }

            // Caso sem rateio complexo
            const catToUse = categories[0] || {};
            let catId = catToUse.id || catToUse.categoria_id;
            if (!catId) {
                // Default fallback categories
                catId = isExpense ? `${tenantId}:other-expense` : `${tenantId}:other-revenue`;
            }

            if (tenantId === 'dc2b6eed-a38a-43c3-9465-ce854bfda90f') {
                const mapping: Record<string, string> = {
                    'a5e9a3c0-464b-4ee8-97c2-41589c16cb39': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:ff1133d9-438c-418f-9fbd-7aaea606c089',
                    'df8e2be4-bc1a-43e6-abcf-e11bdc2166f6': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:cb3d9d47-39e8-4121-ae9b-85a2de798f0f',
                    'c3c491af-26f8-4260-9958-64222c73dffd': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:2093bcb6-0696-4eb3-81ba-54b4bf32d6df',
                    '23b9c662-feca-4284-a11d-39bce5c233fc': 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:0f74ee3e-ed1e-4df8-9672-270873dc22b9',
                };
                if (mapping[catId]) catId = mapping[catId];
            }
            if (!catId.startsWith(tenantId) && catId.length < 36) {
                catId = `${tenantId}:${catId}`;
            }

            const addEntryDirect = (ccId: string | null, val: number, suffix: string) => {
                entries.push({
                    tenantId,
                    categoryId: catId,
                    costCenterId: ccId,
                    month: dateObj.getMonth() + 1,
                    year: dateObj.getFullYear(),
                    amount: val,
                    viewMode,
                    externalId: `sync-${tenantId}-${item.id}-${catId}-${suffix}-${isLost ? 'lost' : 'open'}`,
                    description: description || `Título Previsto`,
                    customer: clientName || null,
                    date: dateObj
                });
            };

            if (ccs.length === 0) {
                addEntryDirect(null, amount, 'NONE');
            } else {
                ccs.forEach((c: any) => {
                    const ccId = c.id;
                    const percent = (c.percentual || (100 / ccs.length)) / 100;
                    addEntryDirect(ccId, amount * percent, ccId || 'NONE');
                });
            }
        }

        if (items.length < 100) hasMore = false;
        else pagina++;
    }
}
