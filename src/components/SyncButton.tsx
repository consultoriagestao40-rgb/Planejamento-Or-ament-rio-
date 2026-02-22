'use client';

import { useState } from 'react';
import { syncFinancialData } from '@/actions/sync';

export function SyncButton({ onSyncComplete }: { onSyncComplete?: () => void }) {
    const [loading, setLoading] = useState(false);
    const [lastSync, setLastSync] = useState<string | null>(null);
    const [data, setData] = useState<any>(null);

    const handleSync = async () => {
        setLoading(true);
        const result = await syncFinancialData();
        setLoading(false);

        if (result.success && result.data) {
            setLastSync(new Date().toLocaleTimeString());
            if (onSyncComplete) onSyncComplete();
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


        </div>
    );
}
