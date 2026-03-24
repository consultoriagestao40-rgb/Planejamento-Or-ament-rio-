'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';

export function ExcelPasteModal({ isOpen, onClose, tenantId: initialTenantId, companies, categories, costCenters, year, viewMode }: {
    isOpen: boolean;
    onClose: () => void;
    tenantId: string;
    companies: any[];
    categories: any[];
    costCenters: any[];
    year: number;
    viewMode: string;
}) {
    const [text, setText] = useState('');
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [overwrite, setOverwrite] = useState(true);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [localTenantId, setLocalTenantId] = useState(initialTenantId);
    const [summary, setSummary] = useState<{ totalP: number, totalRows: number, revenueP: number, preparedSum: number, ignoredSum: number, ignoredRowsCount: number, retentionSum: number } | null>(null);
    const [processedRows, setProcessedRows] = useState<any[] | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Sync localTenantId when prop changes (e.g. user filters in the grid)
    useEffect(() => {
        setLocalTenantId(initialTenantId);
    }, [initialTenantId]);

    const selectedCompany = useMemo(() => companies.find(c => c.id === localTenantId), [companies, localTenantId]);

    // --- VARIANT LOGIC (CNPJ-BASED) ---
    // Identify all variants of the currently selected company using CNPJ base (8 digits)
    const activeVariantIds = useMemo(() => {
        if (!localTenantId || localTenantId === 'DEFAULT') return [];
        const current = companies.find((c: any) => c.id === localTenantId);
        if (!current) return [localTenantId];
        
        // CNPJ grouping logic (Base 8 digits)
        const getBaseCnpj = (cnpj: string) => (cnpj || '').replace(/\D/g, '').substring(0, 8);
        const currentBase = getBaseCnpj(current.cnpj);
        
        const normalize = (n: string) => (n || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/LTDA$/, '').replace(/SA$/, '');
        const currentNorm = normalize(current.name);
        
        return companies
            .filter((c: any) => {
                if (currentBase && currentBase.length === 8) {
                    return getBaseCnpj(c.cnpj) === currentBase;
                }
                return normalize(c.name) === currentNorm;
            })
            .map((c: any) => c.id);
    }, [companies, localTenantId]);

    // Filter categories and cost centers for the WHOLE GROUP (all variants)
    const groupCategories = useMemo(() => categories.filter(c => activeVariantIds.includes(c.tenantId)), [categories, activeVariantIds]);
    const groupCCs = useMemo(() => costCenters.filter(cc => activeVariantIds.includes(cc.tenantId) || !cc.tenantId || cc.id === 'DEFAULT'), [costCenters, activeVariantIds]);
    
    if (!isOpen) return null;

    // Helper ultra-resiliente para números (PT-BR e US)
    const parseSaneNumber = (val: any): number => {
        if (typeof val === 'number') return val;
        let s = String(val || '').trim().replace(/[R$\s]/g, '');
        if (!s) return 0;
        
        const lastComma = s.lastIndexOf(',');
        const lastDot = s.lastIndexOf('.');

        if (lastComma > -1 && lastDot > -1) {
            if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56
            else s = s.replace(/,/g, ''); // 1,234.56
        } else if (lastComma > -1) {
            s = s.replace(',', '.'); // 1234,56
        } else if (lastDot > -1) {
            const parts = s.split('.');
            if (parts[parts.length - 1].length === 3) s = s.replace(/\./g, ''); // 1.500
        }
        return parseFloat(s) || 0;
    };

    const parseDateBR = (val: any): string | null => {
        if (!val) return null;
        if (val instanceof Date) return val.toISOString();
        const s = String(val).trim();
        // Match DD/MM/YYYY or DD/MM/YY
        const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
        if (match) {
            let day = match[1].padStart(2, '0');
            let month = match[2].padStart(2, '0');
            let year = match[3];
            if (year.length === 2) {
                const yr = parseInt(year);
                year = yr > 50 ? '19' + year : '20' + year;
            }
            return `${year}-${month}-${day}`;
        }
        return s; 
    };

    const processMatrix = (matrix: any[][]) => {
        const rows: any[] = [];
        let revenueSumDetected = 0;
        let ignoredRowsCount = 0;
        let ignoredSumTotal = 0;
        let rawSumPInFile = 0;

        // 1. VOTAÇÃO DE COLUNAS (Substitui detecção de header frágil)
        const totalCols = matrix[0]?.length || 0;
        const votesCat = new Array(totalCols).fill(0).map(() => 0);
        const votesVal = new Array(totalCols).fill(0).map(() => 0);

        matrix.slice(0, 50).forEach(row => {
            row.forEach((cell, i) => {
                const s = String(cell || '').trim();
                if (!s) return;

                // Vote for Category: pattern starting with digits (ex: 1.1.1 ou 01.1.1)
                if (/^\d{1,2}(\.\d+)+/.test(s)) {
                    votesCat[i] += 10; // High weight for category pattern
                }

                // Vote for Value: looks like a number
                const clean = s.replace(/[R$\s.]/g, '').replace(',', '.');
                const num = parseFloat(clean);
                if (!isNaN(num) && num !== 0) {
                    // Prevenir votar em colunas de código ou datas
                    if (!/^\d{1,2}(\.\d+)+/.test(s) && !s.includes('/')) {
                        // Peso proporcional ao tamanho do número para evitar colunas de "Mês" (1, 2, 3...)
                        if (Math.abs(num) > 100) votesVal[i] += 5;
                        else votesVal[i] += 1;
                    }
                }
            });
        });

        // BÔNUS: Prioridade explicita para Coluna P (15) e O (14) se tiverem dados
        if (votesVal[15] > 0) votesVal[15] += 50; 
        if (votesCat[14] > 0) votesCat[14] += 50;

        // 1.5. DETECÇÃO DINÂMICA DE CABEÇALHO
        let colVal = 15; // Fallback for colVal loop control

        const firstRow = matrix[0] || [];
        const headerIndices = firstRow.reduce((acc: any, cell, i) => {
            const s = String(cell || '').toLowerCase().trim();
            
            // Lógica de Sinônimos Robusta
            const isValNet = s === 'valor (r$)' || s === 'valor' || s === 'líquido' || s === 'vlr. líquido' || s === 'recebido' || s === 'pago';
            const isValGross = s.includes('valor na categoria') || s === 'valor bruto' || s === 'vlr. bruto' || s === 'total bruto';
            const isCat = s === 'categoria' || s.includes('categoria 1') || s.includes('categoria 01') || s === 'conta contábil' || s === 'nº categoria 1';
            const isDesc = s === 'descrição' || s === 'histórico' || s === 'detalhe';
            const isCustomer = s === 'nome do fornecedor/cliente' || s === 'cliente' || s === 'fornecedor' || s === 'contato' || s.includes('fornecedor/cliente');

            if (acc.valNet === -1 && isValNet) acc.valNet = i;
            if (acc.valGross === -1 && isValGross) acc.valGross = i;
            if (acc.cat === -1 && isCat) acc.cat = i;
            if (acc.desc === -1 && isDesc) acc.desc = i;
            if (acc.cust === -1 && isCustomer) acc.cust = i;
            
            return acc;
        }, { valNet: -1, valGross: -1, cat: -1, desc: -1, cust: -1 });

        // FALLBACKS INTELIGENTES se o header falhar
        let colCat = headerIndices.cat !== -1 ? headerIndices.cat : 14; 
        let colValNet = headerIndices.valNet !== -1 ? headerIndices.valNet : 11;
        let colValGross = headerIndices.valGross !== -1 ? headerIndices.valGross : 15;
        let colDesc = headerIndices.desc !== -1 ? headerIndices.desc : 4;
        let colCust = headerIndices.cust !== -1 ? headerIndices.cust : 6;

        // Se detectou colunas explícitas no início (como no resumo do usuário), prevalece a detecção
        if (headerIndices.valNet !== -1 && headerIndices.valNet < 10) colValNet = headerIndices.valNet;
        if (headerIndices.valGross !== -1 && headerIndices.valGross < 10) colValGross = headerIndices.valGross;
        if (headerIndices.cat !== -1 && headerIndices.cat < 10) colCat = headerIndices.cat;

        // colVal (usado para decidir se pula a linha)
        colVal = colValGross; 

        console.log(`🗳️ [RETER V2] Net: ${colValNet}, Gross: ${colValGross}, Cat: ${colCat}, Desc: ${colDesc}, Cust: ${colCust}`);
        console.log("📝 [CABECALHO] ", JSON.stringify(firstRow));
        
        // 3. Detectar se a primeira linha é cabeçalho ou dados (usando indices detectados ou fallback)
        const isHeader = headerIndices.cat !== -1 || headerIndices.val !== -1 ||
                         String(firstRow[14] || '').toLowerCase().includes('categoria') || 
                         String(firstRow[15] || '').toLowerCase().includes('valor');

        // --- SOMA BRUTA PARA AUDITORIA ---
        matrix.forEach((row, rIdx) => {
            if (rIdx === 0 && isHeader) return; 
            const valP = parseSaneNumber(row[colVal]);
            if (!isNaN(valP)) rawSumPInFile += valP;
        });

        console.log(`📊 [AUDITORIA ARQUIVO BRUTO]`);
        console.log(` - SOMA TOTAL DETECTADA (Col ${String.fromCharCode(65 + colVal)}): ${rawSumPInFile.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} ✅`);
        console.log(`-----------------------------------------------`);

        for (let idx = 0; idx < matrix.length; idx++) {
            const cols = matrix[idx];
            try {
                if (idx === 0 && isHeader) continue; 
                if (!cols || cols.length <= 1) continue;

                // SKIP "TOTAL" ROWS SAFELY (Somente se for literalmente na primeira coluna de data ou categoria)
                const col0 = String(cols[0] || '').toLowerCase().trim();
                const colC = String(cols[colCat] || '').toLowerCase().trim();
                
                if (col0.includes('total') || col0.includes('soma') || colC.includes('total geral') || col0 === 'saldo') {
                    console.log(`⏭️ [DEBUG] Pulando linha ${idx} por ser um resumo/total estrutural.`);
                    continue;
                }

                // --- LÓGICA ULTRA-RESILIENTE PARA CATEGORIA E VALOR ---
                const dataCompetenciaRaw = cols[0];
                const dataCompetencia = parseDateBR(dataCompetenciaRaw);
                const descricao = String(cols[colDesc] || '').trim();
                const fornecedor = String(cols[colCust] || '').trim();
                
                let categoriaRaw = String(cols[colCat] || '').trim();
                let valP = parseSaneNumber(cols[colValGross]); // Gross Value
                let valNet = parseSaneNumber(cols[colValNet]); // Net Value
                
                if (valP === 0 && String(cols[colValGross] || '').trim() === '') {
                    const altValStr = String(cols[colCat] || '').trim();
                    const altVal = parseSaneNumber(altValStr);
                    
                    if (altVal !== 0 && !/^\d{1,2}(\.\d+)+/.test(altValStr)) {
                        valP = altVal;
                        categoriaRaw = String(cols[colCat-1] || '').trim();
                    }
                }

                const finalAmount = isNaN(valP) ? 0 : valP;
                const netAmount = isNaN(valNet) ? 0 : valNet;
                
                // REVENUE DETECTION: Starts with 01 OR 1. OR contains 01.1.1 OR Type is "Receita"
                const isRevenue = categoriaRaw.startsWith('01') || categoriaRaw.startsWith('1.') || categoriaRaw.includes('01.1.1') || String(cols[3] || '').trim().toLowerCase().includes('receita');
                
                // Calculate Retention: Gross - Net
                // ONLY for Revenue categories
                let retention = 0;
                if (isRevenue) {
                    retention = Math.max(0, parseFloat((finalAmount - netAmount).toFixed(2)));
                }

                if (!categoriaRaw && !dataCompetencia && Math.abs(finalAmount) === 0) continue;

                // --- MÊS FIXO (SELECIONADO NO UI) ---
                let rowMonth = selectedMonth;

                // Extrair Código (ex: 01.1.1 ou 1.1.1)
                const catCodeMatch = categoriaRaw.match(/^(\d{1,2}(?:\.\d+)*)/);
                const catCode = catCodeMatch ? catCodeMatch[1] : null;

                console.log(`🔍 [DEBUG LINHA ${idx}] P=${finalAmount} | CatRaw="${categoriaRaw}" | CatCode="${catCode}"`);

                // Mapeamento de Categoria (Now searching across all variants)
                const cat = groupCategories.find(c => {
                    const cleanDBName = (c.name || '').toLowerCase();
                    const cleanDBId = (c.id || '').toLowerCase().split(':').pop() || '';
                    
                    if (catCode) {
                        const normCatCode = catCode.startsWith('0') ? catCode.substring(1) : catCode;
                        const normDBId = cleanDBId.startsWith('0') ? cleanDBId.substring(1) : cleanDBId;
                        
                        if (normDBId === normCatCode || cleanDBName.includes(catCode) || (catCode.startsWith('0') && cleanDBName.includes(catCode.substring(1)))) {
                            return true;
                        }
                    }
                    
                    const cleanCategoriaRaw = categoriaRaw.toLowerCase();
                    return cleanDBName === cleanCategoriaRaw || cleanDBName.includes(cleanCategoriaRaw) || cleanCategoriaRaw.includes(cleanDBName);
                });

                let effectiveCat = cat;
                if (!effectiveCat && Math.abs(finalAmount) > 0) {
                    if (finalAmount > 0) {
                        effectiveCat = groupCategories.find(c => c.id.includes(':01') || c.name.startsWith('01'));
                        console.warn(`⚠️ Cat [${categoriaRaw}] não achada. Fallback Receita pois valor é POSITIVO (+${finalAmount}).`);
                    } else {
                        effectiveCat = groupCategories.find(c => !c.id.includes(':01') && !c.name.startsWith('01'));
                        console.warn(`⚠️ Cat [${categoriaRaw}] não achada. Fallback Despesa pois valor é NEGATIVO (${finalAmount}).`);
                    }
                    if (!effectiveCat) effectiveCat = groupCategories[0];
                }

                if (!effectiveCat) {
                    if (Math.abs(finalAmount) > 0) {
                        ignoredSumTotal += Math.abs(finalAmount);
                        ignoredRowsCount++;
                        console.warn(`❌ Linha ${idx} ignorada TOTALMENTE (Sem Categoria e sem Fallback):`, categoriaRaw, "| Valor:", finalAmount, "| Descrição:", descricao);
                    }
                    continue;
                }

                const catId = (effectiveCat.id || '').toLowerCase();
                const catName = (effectiveCat.name || '').toLowerCase();
                
                // TRACK REVENUE SUM (FIX)
                if (isRevenue) {
                    revenueSumDetected += finalAmount;
                }

                const finalAmountPrepared = isRevenue ? finalAmount : Math.abs(finalAmount);

                const finalDesc = fornecedor ? `${fornecedor} - ${descricao}` : (categoriaRaw ? `${categoriaRaw} - ${descricao}` : descricao);
                
                // --- LÓGICA DE RATEIO PROPORCIONAL ---
                const rateiosInfo: { ccId: string | null, ccName: string, amountInformado: number }[] = [];
                let somaInformadaCCs = 0;

                // Rateios começam logo após a coluna de Valor (colVal + 1)
                const rateioStart = colVal + 1;
                if (cols.length > rateioStart) {
                    for (let i = rateioStart; i < cols.length; i += 2) {
                        const ccName = String(cols[i] || '').trim();
                        const ccAmountRaw = cols[i+1];

                        if (ccName) {
                            let amtCC = parseSaneNumber(ccAmountRaw);
                            
                            if (isNaN(amtCC)) amtCC = 0;

                            const cleanCCName = ccName.toLowerCase().replace(/[^a-z0-9]/g, '');
                            
                            const ccMatches = groupCCs.filter(cc => {
                                const dbCCName = (cc.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                                return dbCCName === cleanCCName || dbCCName.includes(cleanCCName) || cleanCCName.includes(dbCCName);
                            });

                            // Prioritize finding the cost center in the EXACT CURRENT TENANT it belongs to
                            // NEVER FALL BACK to another tenant's cost center, otherwise DRE silently drops the row.
                            const foundCC = ccMatches.find(c => c.tenantId === effectiveCat!.tenantId || c.tenantId === null || c.id === 'DEFAULT');

                            if (foundCC) {
                                let ccId = foundCC.id;
                                rateiosInfo.push({ ccId, ccName, amountInformado: amtCC });
                                somaInformadaCCs += amtCC;
                                console.log(`🔗 [DEBUG RATEIO] Linha ${idx} | CC="${ccName}" | Val=${amtCC}`);
                            } else {
                                // SE NÃO FOR UM CENTRO DE CUSTO VÁLIDO, NÃO ADMITE COMO AMOUNT (EVITA LEAK DE CNPJ/OUTROS)
                                // console.warn(`⏭️ [DEBUG] Coluna ${i} (${ccName}) não é um Centro de Custo válido. Ignorando.`);
                            }
                        }
                    }
                }

                // --- LÓGICA DE RATEIO (VALORES EXATOS) ---
                if (Math.abs(finalAmount) > 0) {
                    if (rateiosInfo.length > 0) {
                        let totalDistributed = 0;
                        
                        rateiosInfo.forEach((info) => {
                            const amt = info.amountInformado;
                            if (Math.abs(amt) > 0) { 
                                // O valor informado no rateio já é o final, mas aplicamos o sinal preparado
                                const amtPrepared = isRevenue ? amt : Math.abs(amt);
                                rows.push({
                                    categoryId: effectiveCat!.id,
                                    costCenterId: info.ccId,
                                    description: finalDesc || 'Importação Excel',
                                    amount: amtPrepared,
                                    month: rowMonth,
                                    date: dataCompetencia, // Pass column A
                                    customer: fornecedor, // Pass column G
                                    tenantId: effectiveCat!.tenantId
                                });
                                totalDistributed += amtPrepared;
                            }
                        });

                        const remainder = finalAmountPrepared - totalDistributed;
                        if (Math.abs(remainder) > 0.01) { 
                            let targetCatId = effectiveCat!.id;

                            const ccIdToUse = rateiosInfo.length > 0 ? rateiosInfo[0].ccId : null;

                            rows.push({
                                categoryId: targetCatId,
                                costCenterId: ccIdToUse,
                                description: finalDesc || (remainder > 0 ? 'SALDO COLUNA P' : 'AJUSTE RATEIO > COL P'),
                                amount: parseFloat(remainder.toFixed(2)), 
                                month: rowMonth,
                                date: dataCompetencia, // Pass column A
                                customer: fornecedor, // Pass column G
                                tenantId: effectiveCat!.tenantId
                            });
                        }
                    } else {
                        // Sem Colunas de Rateio -> Vai tudo para o Centro de Custo Geral (null)
                        rows.push({
                            categoryId: effectiveCat!.id,
                            costCenterId: null,
                            description: finalDesc || 'Importação Excel',
                            amount: finalAmountPrepared,
                            month: rowMonth,
                            date: dataCompetencia,
                            customer: fornecedor,
                            tenantId: effectiveCat!.tenantId
                        });

                        // --- INSERT RETENTION TRANSACTION ---
                        if (retention > 0.01) {
                            const retentionCatId = `${effectiveCat!.tenantId}:02.01.03`;
                            rows.push({
                                categoryId: retentionCatId,
                                costCenterId: null,
                                description: `Retenção de Tributos na Fonte - ${finalDesc || 'Lançamento'}`,
                                amount: retention,
                                month: rowMonth,
                                date: dataCompetencia,
                                customer: fornecedor,
                                tenantId: effectiveCat!.tenantId
                            });
                        }
                    }
                }
            } catch (err) {
                console.error("❌ Erro ao processar linha:", idx, err);
            }
        }

        const totalSumRows = rows.reduce((acc, r) => acc + r.amount, 0);
        const netSumRows = rows.reduce((acc, r) => acc + r.amount, 0);
        
        // --- RESUMO ANALÍTICO POR CATEGORIA ---
        const categorySummary: Record<string, { code: string, name: string, total: number }> = {};
        rows.forEach(r => {
            const cat = groupCategories.find(c => c.id === r.categoryId);
            const catId = cat?.id || 'DESCONHECIDO';
            if (!categorySummary[catId]) {
                const codePart = catId.split(':').pop() || '';
                categorySummary[catId] = { 
                    code: codePart, 
                    name: cat?.name || '?', 
                    total: 0 
                };
            }
            categorySummary[catId].total += r.amount;
        });

        const totalRetention = rows.filter(r => r.categoryId.endsWith(':02.01.03')).reduce((acc, r) => acc + r.amount, 0);

        // Final summary for UI
        setSummary({
            totalP: rawSumPInFile,
            revenueP: revenueSumDetected,
            totalRows: rows.length,
            preparedSum: netSumRows,
            ignoredSum: ignoredSumTotal,
            ignoredRowsCount: ignoredRowsCount,
            retentionSum: totalRetention
        });

        console.log(`🚀 [AUDITORIA] Processamento Concluído!`);
        console.log(` - Empresa Selecionada: ${selectedCompany?.name} (${localTenantId})`);
        console.log(` - Receita Detectada (Col P): ${revenueSumDetected.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} ✅`);
        console.log(` - Soma Geral Absoluta: ${totalSumRows.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
        console.log(` - Valor Ignorado (Sem Categoria): ${ignoredSumTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
        setProcessedRows(rows);
        return rows;
    };

    const handleProcess = async (preProcessedRows?: any[]) => {
        if (localTenantId === 'DEFAULT' || !localTenantId) {
            alert("Por favor, selecione uma empresa primeiro.");
            return;
        }

        setLoading(true);
        setStatus("Enviando dados...");

        try {
            let rows = preProcessedRows;
            
            if (!rows) {
                const lines = text.split('\n').filter(l => l.trim() !== '');
                const matrix = lines.map(line => line.split('\t'));
                rows = processMatrix(matrix);
            }

            if (!rows || rows.length === 0) throw new Error("Nenhum dado válido processado. Verifique o formato do arquivo ou da colagem.");

            const res = await fetch('/api/realized/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    rows, 
                    tenantId: localTenantId, 
                    year, 
                    viewMode, 
                    overwrite: overwrite, // Use the state variable for overwrite
                    month: selectedMonth 
                })
            });
            const data = await res.json();

            if (data.success) {
                const totalSent = rows.reduce((acc: number, r: any) => acc + r.amount, 0);
                window.alert(`✅ SUCESSO NA IMPORTAÇÃO!\n\n💰 Valor Total Enviado: ${totalSent.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n📝 Total de Lançamentos: ${data.count}\n\nOs valores devem aparecer agora no DRE (${meses[selectedMonth - 1]} / ${year}).`);
                setStatus(`Sucesso! ${data.count} registros importados.`);
                setTimeout(() => { 
                    onClose(); 
                    setText(''); 
                    setSummary(null); 
                    setProcessedRows(null);
                    setStatus(null); 
                }, 1500);
            } else {
                throw new Error(data.error);
            }
        } catch (err: any) {
            alert("Erro: " + err.message);
            setStatus(null);
        }
        setLoading(false);
    };

    const handleReset = async () => {
        if (localTenantId === 'DEFAULT' || !localTenantId) {
            alert("Por favor, selecione uma empresa primeiro.");
            return;
        }
        if (!confirm(`⚠️ ATENÇÃO: Tem certeza que deseja ZERAR todos os dados realizados de ${meses[selectedMonth - 1]} / ${year} para esta empresa e suas variantes?\n\nEsta ação apagará todos os registros importados deste mês.`)) {
            return;
        }

        setLoading(true);
        setStatus("Limpando dados...");

        try {
            const res = await fetch('/api/realized/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    rows: [], 
                    tenantId: localTenantId, 
                    year, 
                    viewMode, 
                    overwrite: true, 
                    month: selectedMonth 
                })
            });
            const data = await res.json();

            if (data.success) {
                setStatus(`Sucesso! Dados de ${meses[selectedMonth - 1]} removidos.`);
                setTimeout(() => { onClose(); setStatus(null); }, 2000);
            } else {
                throw new Error(data.error);
            }
        } catch (err: any) {
            alert("Erro ao zerar: " + err.message);
            setStatus(null);
        }
        setLoading(false);
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        setStatus("Lendo arquivo...");

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
                // Tenta pegar a aba "Visão Competência" ou a primeira
                const wsname = wb.SheetNames.find(n => n.includes('Competência')) || wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
                
                // --- AUTO-DETECT MONTH FROM COLUMN A ---
                let detectedMonth = null;
                for (const row of data) {
                    const dateVal = row[0];
                    if (dateVal && (typeof dateVal === 'string' || dateVal instanceof Date)) {
                        const d = new Date(dateVal);
                        if (!isNaN(d.getTime()) && d.getFullYear() >= 2020) {
                            detectedMonth = d.getMonth() + 1;
                            break;
                        }
                    }
                }
                if (detectedMonth && detectedMonth !== selectedMonth) {
                    setSelectedMonth(detectedMonth);
                }

                const rows = processMatrix(data);
                if (rows.length > 0) {
                    const monthName = detectedMonth ? meses[detectedMonth - 1] : meses[selectedMonth - 1];
                    if (confirm(`✅ Detectamos ${rows.length} lançamentos de ${monthName} para a empresa ${selectedCompany?.name || 'selecionada'}.\n\nDeseja realizar a importação agora?`)) {
                        await handleProcess(rows);
                    }
                } else {
                    alert("Não foi possível extrair dados válidos deste arquivo. Verifique se é a planilha de Visão Competência do Conta Azul.");
                }
            } catch (err: any) {
                alert("Erro ao ler arquivo: " + err.message);
            }
            setLoading(false);
            setStatus(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        };
        reader.readAsBinaryString(file);
    };

    const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
            backdropFilter: 'blur(8px)'
        }}>
            <div style={{ backgroundColor: 'white', padding: '2.5rem', borderRadius: '20px', width: '800px', maxWidth: '95%', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
                <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h2 style={{ margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ fontSize: '1.5rem' }}>📂</span> Importar Excel / Arquivo
                        </h2>
                        <p style={{ color: '#64748b', margin: '0.5rem 0 0', fontSize: '0.9rem' }}>Suporta colagem de células ou upload de arquivo .xlsx do Conta Azul.</p>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '2rem', cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}>×</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: '1rem', marginBottom: '1.5rem', alignItems: 'flex-end' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#475569', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Empresa Destino</label>
                        <select 
                            value={localTenantId} 
                            onChange={(e) => setLocalTenantId(e.target.value)}
                            style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '2px solid #e2e8f0', fontSize: '0.9rem', outline: 'none' }}
                        >
                            <option value="DEFAULT">-- Selecione a Empresa --</option>
                            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#475569', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Mês de Competência</label>
                        <select 
                            value={selectedMonth} 
                            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                            style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '2px solid #e2e8f0', fontSize: '0.9rem', outline: 'none' }}
                        >
                            {meses.map((m, i) => <option key={i+1} value={i+1}>{m} / {year}</option>)}
                        </select>
                    </div>
                    <div style={{ paddingBottom: '0.65rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#1e293b', cursor: 'pointer', fontWeight: 600 }}>
                            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} style={{ width: '1.1rem', height: '1.1rem' }} />
                                <span>Sobrescrever Mês</span>
                        </label>
                    </div>
                </div>

                {/* Upload Zone */}
                <div 
                    onClick={() => fileInputRef.current?.click()}
                    style={{ 
                        border: '2px dashed #cbd5e1', 
                        borderRadius: '12px', 
                        padding: '1.5rem', 
                        textAlign: 'center', 
                        cursor: 'pointer', 
                        backgroundColor: '#f8fafc',
                        marginBottom: '1rem',
                        transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
                    onMouseOut={(e) => e.currentTarget.style.borderColor = '#cbd5e1'}
                >
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xlsx,.xls,.csv" style={{ display: 'none' }} />
                    <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📤</div>
                    <p style={{ margin: 0, fontWeight: 700, color: '#1e293b' }}>Clique para fazer upload do arquivo .xlsx</p>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#64748b' }}>Ou use a área de colagem abaixo</p>
                </div>

                {summary && (
                    <div style={{ backgroundColor: '#f0fdf4', padding: '1rem', borderRadius: '12px', marginBottom: '1rem', border: '1px solid #bbf7d0', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                        <div>
                            <p style={{ margin: 0, fontSize: '0.7rem', color: '#166534', fontWeight: 600 }}>RECEITA (01.1.1)</p>
                            <p style={{ margin: 0, fontSize: '1rem', color: '#15803d', fontWeight: 800 }}>{summary.revenueP.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                        </div>
                        <div>
                            <p style={{ margin: 0, fontSize: '0.7rem', color: '#166534', fontWeight: 600 }}>NET TOTAL (ARQUIVO)</p>
                            <p style={{ margin: 0, fontSize: '1rem', color: '#15803d', fontWeight: 800 }}>{summary.totalP.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                        </div>
                        <div>
                            <p style={{ margin: 0, fontSize: '0.7rem', color: '#166534', fontWeight: 600 }}>NET PREPARADO</p>
                            <p style={{ margin: 0, fontSize: '1rem', color: '#15803d', fontWeight: 800 }}>{summary.preparedSum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                        </div>
                        {summary.retentionSum > 0 && (
                            <div style={{ backgroundColor: '#eff6ff', padding: '0.5rem', borderRadius: '8px', border: '1px solid #dbeafe', gridColumn: 'span 3' }}>
                                <p style={{ margin: 0, fontSize: '0.75rem', color: '#1d4ed8', fontWeight: 700 }}>
                                     💵 RETENÇÃO NA FONTE DETECTADA: {summary.retentionSum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </p>
                            </div>
                        )}
                        {summary.ignoredSum > 0 && (
                            <div style={{ backgroundColor: '#fef2f2', padding: '0.5rem', borderRadius: '8px', border: '1px solid #fee2e2', gridColumn: 'span 3' }}>
                                <p style={{ margin: 0, fontSize: '0.75rem', color: '#dc2626', fontWeight: 700 }}>
                                    ⚠️ {summary.ignoredRowsCount} Lançamentos Ignorados (Sem Categoria): {summary.ignoredSum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </p>
                            </div>
                        )}
                        <div style={{ gridColumn: 'span 3', fontSize: '0.75rem', color: '#166534', borderTop: '1px dashed #bbf7d0', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
                            ✅ <b>{summary.totalRows}</b> lançamentos detectados (fidelidade total à Coluna P).
                            {Math.abs(summary.totalP - summary.preparedSum) > 0.1 && (
                                <p style={{ color: '#dc2626', margin: '0.25rem 0 0', fontWeight: 800 }}>
                                    ⚠️ DIFERENÇA DE NET: {(summary.totalP - summary.preparedSum).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="OU cole as células do Excel aqui..."
                    style={{ width: '100%', height: '120px', borderRadius: '12px', border: '2px solid #e2e8f0', padding: '1rem', fontSize: '0.85rem', fontFamily: 'SFMono-Regular, Consolas, monospace', outline: 'none', resize: 'none' }}
                />

                <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button 
                        onClick={handleReset}
                        disabled={loading || localTenantId === 'DEFAULT'}
                        style={{ 
                            padding: '0.75rem 1.25rem', 
                            borderRadius: '10px', 
                            border: '1px solid #fee2e2', 
                            backgroundColor: '#fef2f2', 
                            color: '#dc2626', 
                            fontWeight: 700, 
                            fontSize: '0.8rem',
                            cursor: (loading || localTenantId === 'DEFAULT') ? 'default' : 'pointer',
                            opacity: (loading || localTenantId === 'DEFAULT') ? 0.5 : 1
                        }}
                    >
                        🗑️ ZERAR DADOS DO MÊS
                    </button>
                    
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button onClick={onClose} style={{ padding: '0.75rem 1.5rem', borderRadius: '10px', border: 'none', backgroundColor: '#f1f5f9', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                        <button 
                            onClick={() => handleProcess(processedRows || undefined)} 
                            disabled={loading || (!text && !processedRows) || localTenantId === 'DEFAULT'}
                            style={{ 
                                backgroundColor: (loading || (!text && !processedRows) || localTenantId === 'DEFAULT') ? '#cbd5e1' : '#16a34a', 
                                color: 'white', 
                                padding: '0.75rem 2.5rem', 
                                borderRadius: '10px', 
                                border: 'none', 
                                fontWeight: 700, 
                                cursor: (loading || (!text && !processedRows) || localTenantId === 'DEFAULT') ? 'default' : 'pointer', 
                                boxShadow: (loading || (!text && !processedRows) || localTenantId === 'DEFAULT') ? 'none' : '0 4px 6px -1px rgba(22, 163, 74, 0.4)' 
                            }}
                        >
                            {loading ? status : ((!text && !processedRows) ? 'Cole os dados ou Suba o Arquivo' : (localTenantId === 'DEFAULT' ? 'Selecione a Empresa' : '🚀 Importar agora'))}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
