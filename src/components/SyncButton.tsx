'use client';

import { useState } from 'react';
import { syncFinancialData } from '@/actions/sync';

export function SyncButton({ onSyncComplete, onSyncStart }: { onSyncComplete?: () => void; onSyncStart?: () => void; }) {
    const [loading, setLoading] = useState(false);
    const [lastSync, setLastSync] = useState<string | null>(null);

    const handleSync = async () => {
        setLoading(true);
        if (onSyncStart) onSyncStart();

        // 1. Fast Metadata Sync (categories & cost centers) via Server Action
        const result = await syncFinancialData();

        if (result.success && result.data) {
            // 2. Heavy Data Sync (transactions crunching) via maxDuration API Route
            try {
                const year = new Date().getFullYear();
                const cronRes = await fetch(`/api/cron/sync?year=${year}`);
                const cronData = await cronRes.json();

                if (cronData.success) {
                    setLastSync(new Date().toLocaleTimeString());
                    if (onSyncComplete) onSyncComplete();
                } else {
                    alert(`Rotina local falhou: ${cronData.error || 'Erro desconhecido'}`);
                    if (onSyncComplete) onSyncComplete(); // Resume UI with existing data
                }
            } catch (err) {
                console.error("Cron fetch error:", err);
                alert("Erro ao disparar worker em segundo plano. Detalhes no console.");
            }
        } else {
            alert("Erro ao sincronizar informações (Categorias/CC). Veja o console.");
        }

        setLoading(false);
    };

    return (
        <>
            <button
                onClick={handleSync}
                disabled={loading}
                style={{
                    padding: '0.5rem 1rem',
                    height: '36px',
                    backgroundColor: loading ? '#93c5fd' : '#2563eb',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                }}
            >
                {loading ? '🔄 Sincronizando...' : '🔄 Sincronizar Agora'}
            </button>
            {lastSync && <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.3rem', textAlign: 'right' }}>Última: {lastSync}</div>}
        </>
    );
}
