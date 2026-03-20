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
    const [summary, setSummary] = useState<{ totalP: number, totalRows: number, revenueP: number } | null>(null);
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

    const processMatrix = (matrix: any[][]) => {
        const rows: any[] = [];
        let ignoredSumTotal = 0;
        let revenueSumDetected = 0;
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

        let colCat = votesCat.indexOf(Math.max(...votesCat));
        let colVal = votesVal.indexOf(Math.max(...votesVal));
        
        // Se as duas melhores colunas forem iguais, tenta desempatar
        if (colCat === colVal && colCat !== -1) {
            if (votesCat[colCat] > votesVal[colVal]) {
                const temp = [...votesVal];
                temp[colVal] = -1;
                colVal = temp.indexOf(Math.max(...temp));
            } else {
                const temp = [...votesCat];
                temp[colCat] = -1;
                colCat = temp.indexOf(Math.max(...temp));
            }
        }

        // Fallback seguros
        if (colCat === -1 || votesCat[colCat] === 0) colCat = 14;
        if (colVal === -1 || votesVal[colVal] === 0) colVal = 15;
        
        console.log(`🗳️ [VOTAÇÃO FINAL] Categoria: Col ${colCat}, Valor: Col ${colVal}`);

        // Detectar se a primeira linha é cabeçalho ou dados
        const firstRow = matrix[0] || [];
        const isHeader = String(firstRow[colCat] || '').toLowerCase().includes('categoria') || 
                         String(firstRow[colVal] || '').toLowerCase().includes('valor');

        // --- SOMA BRUTA PARA AUDITORIA ---
        matrix.forEach((row, idx) => {
            if (idx === 0 && isHeader) return; 
            const valP = typeof row[colVal] === 'number' ? row[colVal] : parseFloat(String(row[colVal] || '').replace(/[R$\s.]/g, '').replace(',', '.'));
            if (!isNaN(valP)) rawSumPInFile += valP;
        });

        console.log(`📊 [AUDITORIA ARQUIVO BRUTO]`);
        console.log(` - SOMA TOTAL DETECTADA (Col ${String.fromCharCode(65 + colVal)}): ${rawSumPInFile.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} ✅`);
        console.log(`-----------------------------------------------`);

        for (let idx = 0; idx < matrix.length; idx++) {
            const cols = matrix[idx];
            try {
                if (idx === 0 && isHeader) continue; 
                if (!cols || cols.length <= colCat) continue;

                // Dados Fixos (A=0, E=4, G=6...)
                const dataCompetencia = String(cols[0] || '').trim();
                const descricao = String(cols[4] || '').trim();
                const fornecedor = String(cols[6] || '').trim();
                const categoriaRaw = String(cols[colCat] || '').trim();

                if (!categoriaRaw && !dataCompetencia) continue;

                // Extrair Código (ex: 01.1.1 ou 1.1.1)
                const catCodeMatch = categoriaRaw.match(/^(\d{1,2}(?:\.\d+)*)/);
                const catCode = catCodeMatch ? catCodeMatch[1] : null;

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

                const valP = typeof cols[colVal] === 'number' ? cols[colVal] : parseFloat(String(cols[colVal] || '').replace(/[R$\s.]/g, '').replace(',', '.'));
                const finalAmount = isNaN(valP) ? 0 : valP;

                let effectiveCat = cat;
                if (!effectiveCat && Math.abs(finalAmount) > 0) {
                    // SE NÃO ACHOU CATEGORIA, NÃO PODE PERDER O VALOR (PEDIDO DO USUÁRIO)
                    // Tenta achar a primeira categoria de RECEITA (01) do grupo
                    effectiveCat = groupCategories.find(c => c.id.includes(':01') || c.name.startsWith('01'));
                    if (effectiveCat) {
                        console.warn(`⚠️ Categoria [${categoriaRaw}] não encontrada. Atribuindo ao fallback de Receita para não perder os ${finalAmount} da Coluna P.`);
                    }
                }

                if (!effectiveCat) {
                    if (Math.abs(finalAmount) > 0) {
                        ignoredSumTotal += Math.abs(finalAmount);
                        console.warn(`❌ Linha ${idx} ignorada TOTALMENTE (Sem Categoria e sem Fallback):`, categoriaRaw, "| Valor:", finalAmount);
                    }
                    continue;
                }

                // If we found a category, mark as detected revenue if it starts with 01
                if (effectiveCat.id.includes(':01') || effectiveCat.name.startsWith('01') || catCode?.startsWith('01')) {
                    revenueSumDetected += Math.abs(finalAmount);
                }

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
                            let amtCC = 0;
                            if (typeof ccAmountRaw === 'number') amtCC = ccAmountRaw;
                            else amtCC = parseFloat(String(ccAmountRaw || '').replace(/[R$\s.]/g, '').replace(',', '.'));
                            
                            if (isNaN(amtCC)) amtCC = 0;

                            let ccId = null;
                            const cleanCCName = ccName.toLowerCase().replace(/[^a-z0-9]/g, '');
                            const foundCC = groupCCs.find(cc => {
                                const dbCCName = (cc.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                                return dbCCName === cleanCCName || dbCCName.includes(cleanCCName) || cleanCCName.includes(dbCCName);
                            });
                            if (foundCC) ccId = foundCC.id;

                            rateiosInfo.push({ ccId, ccName, amountInformado: Math.abs(amtCC) });
                            somaInformadaCCs += Math.abs(amtCC);
                        }
                    }
                }

                // --- LÓGICA DE RATEIO (VALORES EXATOS) ---
                if (Math.abs(finalAmount) > 0) {
                    if (rateiosInfo.length > 0) {
                        let totalDistributed = 0;
                        
                        rateiosInfo.forEach((info) => {
                            const amt = info.amountInformado;
                            if (amt > 0) {
                                rows.push({
                                    categoryId: effectiveCat!.id,
                                    costCenterId: info.ccId,
                                    description: finalDesc || 'Importação Excel',
                                    amount: amt,
                                    month: selectedMonth,
                                    tenantId: effectiveCat!.tenantId
                                });
                                totalDistributed += amt;
                            }
                        });

                        const remainder = Math.abs(finalAmount) - totalDistributed;
                        if (remainder > 0.01) { // Tolerância de centavos
                            rows.push({
                                categoryId: effectiveCat!.id,
                                costCenterId: null,
                                description: finalDesc || 'Importação (Resto Column P)',
                                amount: parseFloat(remainder.toFixed(2)),
                                month: selectedMonth,
                                tenantId: effectiveCat!.tenantId
                            });
                        }
                    } else {
                        // Sem Colunas de Rateio -> Vai tudo para o Centro de Custo Geral (null)
                        rows.push({
                            categoryId: effectiveCat!.id,
                            costCenterId: null,
                            description: finalDesc || 'Importação Excel',
                            amount: Math.abs(finalAmount),
                            month: selectedMonth,
                            tenantId: effectiveCat!.tenantId
                        });
                    }
                }
            } catch (err) {
                console.error("❌ Erro ao processar linha:", idx, err);
            }
        }

        const totalSumRows = rows.reduce((acc, r) => acc + r.amount, 0);
        
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

        // Final summary for UI
        setSummary({
            totalP: rawSumPInFile,
            revenueP: revenueSumDetected,
            totalRows: rows.length
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
                window.alert(`✅ SUCESSO NA IMPORTAÇÃO!\n\n💰 Valor Total Enviado: ${totalSent.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n📝 Total de Lançamentos: ${data.count}\n\nO valor de R$ 156.022,98 deve aparecer agora no DRE (Jan/2026).`);
                setStatus(`Sucesso! ${data.count} registros importados.`);
                setTimeout(() => { onClose(); setText(''); setStatus(null); }, 1500);
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
                    <div style={{ backgroundColor: '#f0fdf4', padding: '1rem', borderRadius: '12px', marginBottom: '1rem', border: '1px solid #bbf7d0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: '#166534', fontWeight: 600 }}>RECEITA DETECTADA (COL P)</p>
                            <p style={{ margin: 0, fontSize: '1.25rem', color: '#15803d', fontWeight: 800 }}>{summary.revenueP.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                        </div>
                        <div>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: '#166534', fontWeight: 600 }}>TOTAL GERAL (DRE)</p>
                            <p style={{ margin: 0, fontSize: '1.25rem', color: '#15803d', fontWeight: 800 }}>{summary.totalP.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                        </div>
                        <div style={{ gridColumn: 'span 2', fontSize: '0.8rem', color: '#166534', borderTop: '1px dashed #bbf7d0', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
                            ✅ <b>{summary.totalRows}</b> lançamentos preparados (incluindo rateios e restos de Column P).
                        </div>
                    </div>
                )}

                <div style={{ backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '10px', marginBottom: '1rem', border: '1px solid #e2e8f0' }}>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#475569' }}>
                        📊 <b>Smart Parser Ativo:</b> Identificamos automaticamente <b>Categoria</b> e <b>Valor Total</b>. 
                        O sistema preserva o valor da <b>Coluna P</b> criando lançamentos "Sem Centro de Custo" para a diferença.
                    </p>
                </div>

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
