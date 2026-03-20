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
        if (initialTenantId !== 'DEFAULT') {
            setLocalTenantId(initialTenantId);
        }
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
            
            for (const line of lines) {
                const cols = line.split('\t');
                if (cols.length < 2) continue;

                // Suportando 4 colunas: CATEGORIA | CENTRO DE CUSTO | DESCRIÇÃO | VALOR
                let catName = cols[0].trim();
                let ccName = cols.length >= 4 ? cols[1].trim() : '';
                let desc = cols.length >= 4 ? cols[2].trim() : (cols.length === 3 ? cols[1].trim() : '');
                let amountStr = cols[cols.length - 1].trim();
                
                const amount = parseFloat(amountStr.replace(/[R$\s.]/g, '').replace(',', '.'));

                // Mapeamento de Categoria
                const cat = tenantCategories.find(c => c.name.toLowerCase() === catName.toLowerCase()) 
                         || tenantCategories.find(c => c.name.toLowerCase().includes(catName.toLowerCase()));

                if (!cat) continue;

                // Mapeamento de Centro de Custo
                let ccId = null;
                if (ccName && ccName.toLowerCase() !== 'geral') {
                    const foundCC = tenantCCs.find(cc => cc.name.toLowerCase().includes(ccName.toLowerCase()));
                    if (foundCC) ccId = foundCC.id;
                }

                rows.push({ 
                    categoryId: cat.id, 
                    costCenterId: ccId, 
                    description: desc || 'Importação Excel',
                    amount,
                    month: selectedMonth
                });
            }

            if (rows.length === 0) throw new Error("Nenhuma categoria reconhecida. Verifique se os nomes batem com o sistema.");

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
                        📊 <b>Formato Esperado (4 Colunas):</b> 
                        <br/>
                        <code style={{ background: '#fff', padding: '2px 4px', borderRadius: '4px', border: '1px solid #bae6fd' }}>CATEGORIA</code> | 
                        <code style={{ background: '#fff', padding: '2px 4px', borderRadius: '4px', border: '1px solid #bae6fd' }}>CENTRO DE CUSTO</code> | 
                        <code style={{ background: '#fff', padding: '2px 4px', borderRadius: '4px', border: '1px solid #bae6fd' }}>DESCRIÇÃO</code> | 
                        <code style={{ background: '#fff', padding: '2px 4px', borderRadius: '4px', border: '1px solid #bae6fd' }}>VALOR</code>
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
                            backgroundColor: localTenantId === 'DEFAULT' ? '#cbd5e1' : '#f59e0b', 
                            color: 'white', 
                            padding: '0.75rem 2.5rem', 
                            borderRadius: '10px', 
                            border: 'none', 
                            fontWeight: 700, 
                            cursor: localTenantId === 'DEFAULT' ? 'default' : 'pointer', 
                            boxShadow: localTenantId === 'DEFAULT' ? 'none' : '0 4px 6px -1px rgba(245, 158, 11, 0.4)' 
                        }}
                    >
                        {loading ? status : (localTenantId === 'DEFAULT' ? 'Selecione a Empresa' : '🚀 Importar para ' + (selectedCompany?.name || ''))}
                    </button>
                </div>
            </div>
        </div>
    );
}
