'use client';

import { useState } from 'react';
import { syncFinancialData } from '@/actions/sync';

export function SyncButton() {
    const [loading, setLoading] = useState(false);
    const [lastSync, setLastSync] = useState<string | null>(null);
    const [data, setData] = useState<any>(null);

    const handleSync = async () => {
        setLoading(true);
        const result = await syncFinancialData();
        setLoading(false);

        if (result.success && result.data) {
            setLastSync(new Date().toLocaleTimeString());
            setData(result.data);
            alert("Sincronização concluída com sucesso!");
        } else {
            alert("Erro ao sincronizar. Veja o console.");
        }
    };

    return (
        <div>
            <button
                onClick={handleSync}
                disabled={loading}
                style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: loading ? '#ccc' : '#2563eb',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: loading ? 'not-allowed' : 'pointer'
                }}
            >
                {loading ? 'Sincronizando...' : '🔄 Sincronizar Agora'}
            </button>
            {lastSync && <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.5rem' }}>Última: {lastSync}</div>}

            {data && (
                <div style={{
                    position: 'fixed',
                    top: '20%',
                    left: '20%',
                    right: '20%',
                    background: 'white',
                    padding: '2rem',
                    border: '1px solid #ccc',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                    zIndex: 100,
                    maxHeight: '60vh',
                    overflow: 'auto'
                }}>
                    <h3>Dados Recebidos (Debug)</h3>
                    <button onClick={() => setData(null)} style={{ float: 'right' }}>X</button>
                    <pre>{JSON.stringify(data, null, 2)}</pre>
                </div>
            )}
        </div>
    );
}
