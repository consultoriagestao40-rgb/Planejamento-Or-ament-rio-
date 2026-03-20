'use client';

import { useState } from 'react';

export function ExcelPasteModal({ isOpen, onClose, companies, categories, initialYear, initialViewMode }: {
    isOpen: boolean;
    onClose: () => void;
    companies: any[];
    categories: any[];
    initialYear: number;
    initialViewMode: string;
}) {
    const [text, setText] = useState('');
    const [selectedTenant, setSelectedTenant] = useState(companies[0]?.id || '');
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [overwrite, setOverwrite] = useState(true);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<string | null>(null);

    // Filter categories and cost centers for the selected tenant
    const tenantCategories = categories.filter(c => c.tenantId === selectedTenant);
    
    // We need cost centers too. They are usually in categories or fetched separately.
    // For now, let's assume we can find them if they exist in the DB.
    
    if (!isOpen) return null;

    const handleProcess = async () => {
        setLoading(true);
        setStatus("Processando e salvando...");
        try {
            const lines = text.split('\n').filter(l => l.trim() !== '');
            const rows: any[] = [];
            
            for (const line of lines) {
                const cols = line.split('\t');
                if (cols.length < 2) continue; // At least Cat and Value

                const catName = cols[0].trim();
                let ccName = cols.length > 3 ? cols[1].trim() : '';
                let description = cols.length > 3 ? cols[2].trim() : (cols.length === 3 ? cols[1].trim() : '');
                let amountStr = cols[cols.length - 1].trim();
                
                const amount = parseFloat(amountStr.replace(/[R$\s.]/g, '').replace(',', '.'));

                // Find Category ID
                const cat = tenantCategories.find(c => c.name.toLowerCase() === catName.toLowerCase()) 
                         || tenantCategories.find(c => c.name.toLowerCase().includes(catName.toLowerCase()));

                if (cat) {
                    rows.push({ 
                        categoryId: cat.id, 
                        costCenterId: null, // Optimization: find CC ID if possible
                        description: description || 'Importação Excel',
                        amount,
                        month: selectedMonth
                    });
                }
            }

            if (rows.length === 0) throw new Error("Nenhuma categoria reconhecida. Verifique se o nome da categoria no Excel é igual ao do sistema.");

            const res = await fetch('/api/realized/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    rows, 
                    tenantId: selectedTenant, 
                    year: initialYear, 
                    viewMode: initialViewMode,
                    overwrite,
                    month: selectedMonth
                })
            });
            const data = await res.json();

            if (data.success) {
                setStatus(`Sucesso! ${data.count} registros processados.`);
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

    const meses = [
        "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
            backdropFilter: 'blur(4px)'
        }}>
            <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '16px', width: '700px', maxWidth: '95%', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ margin: 0, color: '#1e293b' }}>📊 Importação Avançada do Excel</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5rem', color: '#94a3b8' }}>&times;</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '0.4rem' }}>EMPRESA</label>
                        <select 
                            value={selectedTenant} 
                            onChange={(e) => setSelectedTenant(e.target.value)}
                            style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}
                        >
                            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '0.4rem' }}>MÊS DE REFERÊNCIA</label>
                        <select 
                            value={selectedMonth} 
                            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                            style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}
                        >
                            {meses.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                        </select>
                    </div>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#334155', cursor: 'pointer' }}>
                        <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
                        <span>Substituir/Sobrescrever dados existentes deste mês (Atualização Semanal)</span>
                    </label>
                </div>

                <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.5rem' }}>
                    Cole as colunas do Excel nesta ordem: <b>Categoria | Descrição | Valor</b> (O Centro de Custo será alocado na categoria correspondente).
                </p>
                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Cole aqui as células do Excel (Ex: Energia Elétrica	Ref. Março 2026	1.500,00)"
                    style={{ width: '100%', height: '220px', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '1rem', fontSize: '0.85rem', fontFamily: 'monospace' }}
                />

                <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                    <button onClick={onClose} style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', cursor: 'pointer' }}>Cancelar</button>
                    <button 
                        onClick={handleProcess} 
                        disabled={loading || !text}
                        style={{ backgroundColor: '#2563eb', color: 'white', padding: '0.6rem 1.5rem', borderRadius: '8px', border: 'none', fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}
                    >
                        {loading ? status : '📁 Importar e Atualizar'}
                    </button>
                </div>
            </div>
        </div>
    );
}
