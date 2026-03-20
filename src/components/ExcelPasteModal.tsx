'use client';

import { useState, useMemo } from 'react';

export function ExcelPasteModal({ isOpen, onClose, tenantId, companyName, categories, costCenters, year, viewMode }: {
    isOpen: boolean;
    onClose: () => void;
    tenantId: string;
    companyName: string;
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

    // Filter categories and cost centers for the specific tenant
    const tenantCategories = useMemo(() => categories.filter(c => c.tenantId === tenantId), [categories, tenantId]);
    const tenantCCs = useMemo(() => costCenters.filter(cc => cc.tenantId === tenantId || !cc.tenantId || cc.id === 'DEFAULT'), [costCenters, tenantId]);
    
    if (!isOpen) return null;

    const handleProcess = async () => {
        setLoading(true);
        setStatus("Processando colagem...");
        try {
            const lines = text.split('\n').filter(l => l.trim() !== '');
            const rows: any[] = [];
            
            for (const line of lines) {
                const cols = line.split('\t');
                if (cols.length < 2) continue;

                // Suportando 4 colunas: CATEGORIA | CENTRO DE CUSTO | DESCRIÇÃO | VALOR
                // Se vierem menos colunas, tentamos deduzir.
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
                body: JSON.stringify({ rows, tenantId, year, viewMode, overwrite, month: selectedMonth })
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
            <div style={{ backgroundColor: 'white', padding: '2.5rem', borderRadius: '20px', width: '750px', maxWidth: '95%', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
                <div style={{ marginBottom: '1.5rem' }}>
                    <h2 style={{ margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '1.5rem' }}>📂</span> Importar Excel: {companyName}
                    </h2>
                    <p style={{ color: '#64748b', margin: '0.5rem 0 0', fontSize: '0.9rem' }}>Os dados serão salvos especificamente para esta empresa.</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Mês do Excel</label>
                        <select 
                            value={selectedMonth} 
                            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                            style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '1rem', outline: 'none' }}
                        >
                            {meses.map((m, i) => <option key={i+1} value={i+1}>{m} / {year}</option>)}
                        </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '0.75rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.9rem', color: '#1e293b', cursor: 'pointer', fontWeight: 500 }}>
                            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} style={{ width: '1.2rem', height: '1.2rem' }} />
                            <span>Sobrescrever este mês (Versão Semanal)</span>
                        </label>
                    </div>
                </div>

                <div style={{ backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '10px', marginBottom: '1rem', border: '1px dashed #cbd5e1' }}>
                    <p style={{ fontSize: '0.8rem', color: '#475569', margin: 0 }}>
                        💡 <b>Instrução:</b> Cole 4 colunas do seu Excel: 
                        <br/>
                        <code style={{ background: '#e2e8f0', padding: '2px 4px', borderRadius: '4px' }}>CATEGORIA</code> | 
                        <code style={{ background: '#e2e8f0', padding: '2px 4px', borderRadius: '4px' }}>CENTRO DE CUSTO</code> | 
                        <code style={{ background: '#e2e8f0', padding: '2px 4px', borderRadius: '4px' }}>DESCRIÇÃO</code> | 
                        <code style={{ background: '#e2e8f0', padding: '2px 4px', borderRadius: '4px' }}>VALOR</code>
                    </p>
                </div>

                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Cole aqui as células..."
                    style={{ width: '100%', height: '240px', borderRadius: '12px', border: '2px solid #e2e8f0', padding: '1rem', fontSize: '0.85rem', fontFamily: 'SFMono-Regular, Consolas, monospace', outline: 'none' }}
                />

                <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                    <button onClick={onClose} style={{ padding: '0.75rem 1.5rem', borderRadius: '10px', border: 'none', backgroundColor: '#f1f5f9', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                    <button 
                        onClick={handleProcess} 
                        disabled={loading || !text}
                        style={{ backgroundColor: '#2563eb', color: 'white', padding: '0.75rem 2rem', borderRadius: '10px', border: 'none', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.4)' }}
                    >
                        {loading ? status : '🚀 Importar para ' + companyName}
                    </button>
                </div>
            </div>
        </div>
    );
}
