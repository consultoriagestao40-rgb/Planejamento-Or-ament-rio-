'use client';

import { useState } from 'react';

export function ExcelPasteModal({ isOpen, onClose, tenantId, year, viewMode, categories }: {
    isOpen: boolean;
    onClose: () => void;
    tenantId: string;
    year: number;
    viewMode: string;
    categories: any[];
}) {
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleProcess = async () => {
        setLoading(true);
        setStatus("Processando colagem...");
        try {
            const lines = text.split('\n').filter(l => l.trim() !== '');
            const rows: any[] = [];
            
            // Supondo: Coluna 0 = Nome Categoria, Coluna 1 = Mês (1-12), Coluna 2 = Valor
            for (const line of lines) {
                const cols = line.split('\t');
                if (cols.length < 3) continue;

                const catName = cols[0].trim();
                const month = parseInt(cols[1].trim(), 10);
                const amount = parseFloat(cols[2].trim().replace(',', '.'));

                // Tenta achar categoria por nome similar
                const cat = categories.find(c => c.name.toLowerCase().includes(catName.toLowerCase()));
                if (cat) {
                    rows.push({ categoryId: cat.id, month, amount });
                }
            }

            if (rows.length === 0) throw new Error("Nenhuma categoria reconhecida encontrada nas linhas coladas.");

            const res = await fetch('/api/realized/bulk', {
                method: 'POST',
                body: JSON.stringify({ rows, tenantId, year, viewMode })
            });
            const data = await res.json();

            if (data.success) {
                setStatus(`Sucesso! ${data.count} registros inseridos.`);
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

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
            <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '12px', width: '600px', maxWidth: '90%' }}>
                <h3 style={{ marginTop: 0 }}>Importar do Excel (Copiar/Colar)</h3>
                <p style={{ fontSize: '0.85rem', color: '#666' }}>
                    Copie de uma planilha com 3 colunas: <b>Nome Categoria | Mês (1-12) | Valor</b> e cole abaixo.
                </p>
                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Cole aqui as células da planilha..."
                    style={{ width: '100%', height: '200px', borderRadius: '8px', border: '1px solid #ddd', padding: '1rem' }}
                />
                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                    <button onClick={onClose} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #ddd' }}>Cancelar</button>
                    <button 
                        onClick={handleProcess} 
                        disabled={loading || !text}
                        style={{ backgroundColor: '#2563eb', color: 'white', padding: '0.5rem 1rem', borderRadius: '6px', border: 'none' }}
                    >
                        {loading ? status : 'Processar e Salvar'}
                    </button>
                </div>
            </div>
        </div>
    );
}
