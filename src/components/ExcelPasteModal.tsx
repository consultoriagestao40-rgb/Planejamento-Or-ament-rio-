'use client';

import { useState, useMemo, useEffect } from 'react';

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

    // Sync localTenantId when prop changes (e.g. user filters in the grid)
    useEffect(() => {
        setLocalTenantId(initialTenantId);
    }, [initialTenantId]);

    const selectedCompany = useMemo(() => companies.find(c => c.id === localTenantId), [companies, localTenantId]);

    // Filter categories and cost centers for the specific tenant
    const tenantCategories = useMemo(() => categories.filter(c => c.tenantId === localTenantId), [categories, localTenantId]);
    const tenantCCs = useMemo(() => costCenters.filter(cc => cc.tenantId === localTenantId || !cc.tenantId || cc.id === 'DEFAULT'), [costCenters, localTenantId]);
    
    if (!isOpen) return null;

    const handleProcess = async () => {
        if (localTenantId === 'DEFAULT' || !localTenantId) {
            alert("Por favor, selecione uma empresa primeiro.");
            return;
        }

        setLoading(true);
        setStatus("Processando colagem...");
        try {
            const lines = text.split('\n').filter(l => l.trim() !== '');
            const rows: any[] = [];
            
            console.log("Iniciando processamento de", lines.length, "linhas");

            for (const line of lines) {
                const cols = line.split('\t');
                if (cols.length < 15) continue; // Precisa ter pelo menos até a coluna da Categoria

                // Dados Fixos
                const dataCompetencia = cols[0].trim();
                const descricao = cols[4]?.trim() || '';
                const fornecedor = cols[6]?.trim() || '';
                const valorTotalStr = cols[11]?.trim() || '0';
                const categoriaRaw = cols[14]?.trim() || '';

                // Se for cabeçalho, pular
                if (dataCompetencia.toLowerCase().includes('data') || categoriaRaw.toLowerCase().includes('categoria')) continue;

                // Extrair Código de Categoria (ex: 03.3.1)
                const catCodeMatch = categoriaRaw.match(/^(\d{1,2}\.\d{1,2}(\.\d{1,2})?)/);
                const catCode = catCodeMatch ? catCodeMatch[1] : null;

                // Mapeamento de Categoria
                const cat = tenantCategories.find(c => {
                    const cleanName = c.name.toLowerCase();
                    if (catCode && (c.id === catCode || c.name.startsWith(catCode))) return true;
                    return cleanName === categoriaRaw.toLowerCase() || categoriaRaw.toLowerCase().includes(cleanName);
                });

                if (!cat) {
                    console.warn("Categoria não mapeada:", categoriaRaw);
                    continue;
                }

                const finalDesc = fornecedor ? `${fornecedor} - ${descricao}` : descricao;
                
                // Processar Rateios (Col 16 em diante, pares de CC e Valor)
                let hasRateio = false;
                if (cols.length > 16) {
                    for (let i = 16; i < cols.length; i += 2) {
                        const ccName = cols[i]?.trim();
                        const ccAmountStr = cols[i+1]?.trim();

                        if (ccName && ccAmountStr) {
                            const ccAmount = parseFloat(ccAmountStr.replace(/[R$\s.]/g, '').replace(',', '.'));
                            if (!isNaN(ccAmount) && ccAmount !== 0) {
                                // Mapeamento de CC
                                let ccId = null;
                                const foundCC = tenantCCs.find(cc => cc.name.trim().toLowerCase() === ccName.toLowerCase() || ccName.toLowerCase().includes(cc.name.trim().toLowerCase()));
                                if (foundCC) ccId = foundCC.id;

                                rows.push({
                                    categoryId: cat.id,
                                    costCenterId: ccId,
                                    description: finalDesc || 'Importação Excel',
                                    amount: ccAmount,
                                    month: selectedMonth
                                });
                                hasRateio = true;
                            }
                        }
                    }
                }

                // Se não teve rateio ou as colunas de rateio estavam vazias, usa o valor total
                if (!hasRateio) {
                    const totalAmount = parseFloat(valorTotalStr.replace(/[R$\s.]/g, '').replace(',', '.'));
                    if (!isNaN(totalAmount) && totalAmount !== 0) {
                        rows.push({
                            categoryId: cat.id,
                            costCenterId: null, // Geral
                            description: finalDesc || 'Importação Excel',
                            amount: totalAmount,
                            month: selectedMonth
                        });
                    }
                }
            }

            if (rows.length === 0) throw new Error("Nenhum dado válido processado. Verifique se copiou as colunas corretas (Data até Rateios).");

            console.log("Enviando", rows.length, "registros para o servidor");

            const res = await fetch('/api/realized/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rows, tenantId: localTenantId, year, viewMode, overwrite, month: selectedMonth })
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
                            <span style={{ fontSize: '1.5rem' }}>📂</span> Importar do Excel
                        </h2>
                        <p style={{ color: '#64748b', margin: '0.5rem 0 0', fontSize: '0.9rem' }}>Os dados serão vinculados à empresa e centros de custo selecionados.</p>
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

                <div style={{ backgroundColor: '#f0f9ff', padding: '1rem', borderRadius: '10px', marginBottom: '1rem', border: '1px solid #bae6fd' }}>
                    <p style={{ fontSize: '0.8rem', color: '#0369a1', margin: 0 }}>
                        📊 <b>Smart Parser Ativo:</b> Copie as linhas da planilha <b>"Visão Competência"</b> do Conta Azul.
                        <br/>
                        O sistema identifica automaticamente: <b>Data, Descrição, Fornecedor, Categoria</b> e todos os <b>Rateios (Col Q em diante)</b>.
                    </p>
                </div>

                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Cole as células do Excel aqui..."
                    style={{ width: '100%', height: '220px', borderRadius: '12px', border: '2px solid #e2e8f0', padding: '1rem', fontSize: '0.85rem', fontFamily: 'SFMono-Regular, Consolas, monospace', outline: 'none', resize: 'none' }}
                />

                <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                    <button onClick={onClose} style={{ padding: '0.75rem 1.5rem', borderRadius: '10px', border: 'none', backgroundColor: '#f1f5f9', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                    <button 
                        onClick={handleProcess} 
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
                        {loading ? status : (!text ? 'Cole os dados do Excel' : (localTenantId === 'DEFAULT' ? 'Selecione a Empresa' : '🚀 Importar agora'))}
                    </button>
                </div>
            </div>
        </div>
    );
}
