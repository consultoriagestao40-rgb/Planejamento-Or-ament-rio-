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
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Sync localTenantId when prop changes (e.g. user filters in the grid)
    useEffect(() => {
        setLocalTenantId(initialTenantId);
    }, [initialTenantId]);

    const selectedCompany = useMemo(() => companies.find(c => c.id === localTenantId), [companies, localTenantId]);

    // Filter categories and cost centers for the specific tenant
    const tenantCategories = useMemo(() => categories.filter(c => c.tenantId === localTenantId), [categories, localTenantId]);
    const tenantCCs = useMemo(() => costCenters.filter(cc => cc.tenantId === localTenantId || !cc.tenantId || cc.id === 'DEFAULT'), [costCenters, localTenantId]);
    
    if (!isOpen) return null;

    const processMatrix = (matrix: any[][]) => {
        const rows: any[] = [];
        let ignoredSum = 0;
        let revenueSum = 0;

        for (const cols of matrix) {
            try {
                if (!cols || cols.length < 15) continue;

                // Dados Fixos (A=0, E=4, G=6, L=11, O=14, P=15)
                const dataCompetencia = String(cols[0] || '').trim();
                const descricao = String(cols[4] || '').trim();
                const fornecedor = String(cols[6] || '').trim();
                const categoriaRaw = String(cols[14] || '').trim();

                // Pular cabeçalhos (mas ser tolerante se houver valor e categoria em baixo)
                if (dataCompetencia.toLowerCase().includes('competência') || categoriaRaw.toLowerCase().includes('categoria')) continue;
                if (!dataCompetencia && !categoriaRaw) continue;

                // Extrair Código (ex: 03.3.1 ou 3.3.1)
                const catCodeMatch = categoriaRaw.match(/^(\d{1,2}\.\d{1,2}(\.\d{1,2})?)/);
                const catCode = catCodeMatch ? catCodeMatch[1] : null;

                // Mapeamento de Categoria
                const cat = tenantCategories.find(c => {
                    const cleanDBName = (c.name || '').toLowerCase();
                    const cleanDBId = (c.id || '').toLowerCase();
                    
                    if (catCode) {
                        // Comparar códigos normalizados (removendo zeros à esquerda se necessário)
                        const dbIdPart = cleanDBId.split(':').pop();
                        const isDbIdMatch = dbIdPart === catCode || (catCode.startsWith('0') && dbIdPart === catCode.substring(1));
                        
                        if (isDbIdMatch || cleanDBName.startsWith(catCode) || (catCode.startsWith('0') && cleanDBName.startsWith(catCode.substring(1)))) {
                            return true;
                        }
                    }
                    return cleanDBName === categoriaRaw.toLowerCase() || categoriaRaw.toLowerCase().includes(cleanDBName);
                });

                const valP = typeof cols[15] === 'number' ? cols[15] : parseFloat(String(cols[15] || '').replace(/[R$\s.]/g, '').replace(',', '.'));
                const valL = typeof cols[11] === 'number' ? cols[11] : parseFloat(String(cols[11] || '').replace(/[R$\s.]/g, '').replace(',', '.'));
                const finalAmount = (isNaN(valP) || valP === 0) ? (isNaN(valL) ? 0 : valL) : valP;

                // DEBUG ESPECÍFICO PARA O USUÁRIO VER NO CONSOLE
                if (catCode === '01.1.1' || catCode === '01.2.1' || catCode === '1.1.1' || catCode === '1.2.1') {
                    console.log(`🔍 [DEBUG ${catCode}] Col O: "${categoriaRaw}" | Col L (idx11): ${cols[11]} | Col P (idx15): ${cols[15]} | Final Usado: ${finalAmount}`);
                }

                if (!cat) {
                    if (Math.abs(finalAmount) > 0) {
                        ignoredSum += Math.abs(finalAmount);
                        console.warn("⚠️ Linha ignorada por falta de categoria:", categoriaRaw, "| Valor:", finalAmount);
                    }
                    continue;
                }

                const finalDesc = fornecedor ? `${fornecedor} - ${descricao}` : descricao;
                
                // Processar Rateios (Col 16 em diante, pares de CC e Valor)
                let hasRateio = false;
                if (cols.length > 16) {
                    for (let i = 16; i < cols.length; i += 2) {
                        const ccName = String(cols[i] || '').trim();
                        const ccAmountVal = cols[i+1];

                        if (ccName && ccAmountVal !== undefined && ccAmountVal !== null && ccAmountVal !== '') {
                            let ccAmount = 0;
                            if (typeof ccAmountVal === 'number') {
                                ccAmount = ccAmountVal;
                            } else {
                                ccAmount = parseFloat(String(ccAmountVal).replace(/[R$\s.]/g, '').replace(',', '.'));
                            }

                            if (!isNaN(ccAmount) && ccAmount !== 0) {
                                let ccId = null;
                                const foundCC = tenantCCs.find(cc => (cc.name || '').trim().toLowerCase() === ccName.toLowerCase() || ccName.toLowerCase().includes((cc.name || '').trim().toLowerCase()));
                                if (foundCC) ccId = foundCC.id;

                                rows.push({
                                    categoryId: cat.id,
                                    costCenterId: ccId,
                                    description: finalDesc || 'Importação Excel',
                                    amount: Math.abs(ccAmount),
                                    month: selectedMonth
                                });
                                hasRateio = true;
                                if (cat.id.includes(':01') || cat.name.startsWith('01')) revenueSum += Math.abs(ccAmount);
                            }
                        }
                    }
                }

                if (!hasRateio && Math.abs(finalAmount) > 0) {
                    rows.push({
                        categoryId: cat.id,
                        costCenterId: null,
                        description: finalDesc || 'Importação Excel',
                        amount: Math.abs(finalAmount),
                        month: selectedMonth
                    });
                    if (cat.id.includes(':01') || cat.name.startsWith('01')) revenueSum += Math.abs(finalAmount);
                }
            } catch (err) {
                console.error("❌ Erro ao processar linha:", cols, err);
            }
        }

        const totalSum = rows.reduce((acc, r) => acc + r.amount, 0);
        console.log(`🚀 [IMPORT] Processamento Concluído!`);
        console.log(` - Empresa: ${selectedCompany?.name} (ID: ${localTenantId})`);
        console.log(` - Mês Alvo: ${meses[selectedMonth-1]}`);
        console.log(` - Total de Linhas Importadas: ${rows.length}`);
        console.log(` - Receita (01.x): ${revenueSum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
        console.log(` - TOTAL GERAL ABSOLUTO: ${totalSum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
        console.log(` - VALOR IGNORADO (SEM CATEGORIA): ${ignoredSum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} 🚩`);

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
                setStatus(`Sucesso! ${data.count} registros importados.`);
                setTimeout(() => { onClose(); setText(''); setStatus(null); }, 2000);
            } else {
                throw new Error(data.error);
            }
        } catch (err: any) {
            alert("Erro: " + err.message);
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

                <div style={{ backgroundColor: '#f0f9ff', padding: '1rem', borderRadius: '10px', marginBottom: '1rem', border: '1px solid #bae6fd' }}>
                    <p style={{ fontSize: '0.8rem', color: '#0369a1', margin: 0 }}>
                        📊 <b>Smart Parser Ativo:</b> Ele identifica automaticamente <b>Data, Fornecedor, Categoria</b> e todos os <b>Rateios (Horizontal)</b> na planilha do Conta Azul.
                    </p>
                </div>

                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="OU cole as células do Excel aqui..."
                    style={{ width: '100%', height: '120px', borderRadius: '12px', border: '2px solid #e2e8f0', padding: '1rem', fontSize: '0.85rem', fontFamily: 'SFMono-Regular, Consolas, monospace', outline: 'none', resize: 'none' }}
                />

                <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                    <button onClick={onClose} style={{ padding: '0.75rem 1.5rem', borderRadius: '10px', border: 'none', backgroundColor: '#f1f5f9', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                    <button 
                        onClick={() => handleProcess()} 
                        disabled={loading || !text || localTenantId === 'DEFAULT'}
                        style={{ 
                            backgroundColor: (loading || !text || localTenantId === 'DEFAULT') ? '#cbd5e1' : '#16a34a', 
                            color: 'white', 
                            padding: '0.75rem 2.5rem', 
                            borderRadius: '10px', 
                            border: 'none', 
                            fontWeight: 700, 
                            cursor: (loading || !text || localTenantId === 'DEFAULT') ? 'default' : 'pointer', 
                            boxShadow: (loading || !text || localTenantId === 'DEFAULT') ? 'none' : '0 4px 6px -1px rgba(22, 163, 74, 0.4)' 
                        }}
                    >
                        {loading ? status : (!text ? 'Cole os dados ou Suba o Arquivo' : (localTenantId === 'DEFAULT' ? 'Selecione a Empresa' : '🚀 Importar agora'))}
                    </button>
                </div>
            </div>
        </div>
    );
}
