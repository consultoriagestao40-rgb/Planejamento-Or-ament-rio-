'use client';

import { useState } from 'react';
import { syncFinancialData } from '@/actions/sync';

export function SyncButton({ onSyncComplete, onSyncStart, year }: { onSyncComplete?: () => void; onSyncStart?: () => void; year?: number }) {
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState<string | null>(null);
    const [lastSync, setLastSync] = useState<string | null>(null);

    const handleSync = async () => {
        setLoading(true);
        if (onSyncStart) onSyncStart();

        try {
            // 1. Obter lista de empresas
            setProgress("Obtendo lista de empresas...");
            const compRes = await fetch('/api/companies');
            const compData = await compRes.json();
            
            if (!compData.success || !compData.companies) {
                throw new Error("Falha ao carregar lista de empresas");
            }

            const companies = compData.companies;
            const targetYear = year || new Date().getFullYear();

            for (let i = 0; i < companies.length; i++) {
                const company = companies[i];
                setProgress(`Sincronizando ${company.name} (${i + 1}/${companies.length})...`);
                
                // 1.1 Sincronizar Metadados (Server Action)
                // Nota: syncFinancialData precisaria ser atualizado para aceitar tenantId se quisermos ser 100% granulares aqui também.
                // Mas geralmente metadados são rápidos. Vamos manter assim por enquanto ou passar o target.
                const metaResult = await syncFinancialData(); 
                if (!metaResult.success) {
                    console.warn(`Aviso: Sincronização de metadados para ${company.name} retornou erro.`);
                }

                // 1.2 Sincronizar Valores (API Route com timeout controlado)
                const cronRes = await fetch(`/api/cron/sync?year=${targetYear}&tenantId=${company.id}`);
                const cronData = await cronRes.json();

                if (!cronData.success) {
                    console.error(`Erro na empresa ${company.name}:`, cronData.error);
                }
            }

            setLastSync(new Date().toLocaleTimeString());
            setProgress(null);
            if (onSyncComplete) onSyncComplete();

        } catch (err: any) {
            console.error("Sync orchestration error:", err);
            alert(`Erro na sincronização: ${err.message || 'Erro desconhecido'}`);
            setProgress(null);
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
                {loading ? `🔄 ${progress || 'Sincronizando...'}` : '🔄 Sincronizar Agora'}
            </button>
            {lastSync && <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.3rem', textAlign: 'right' }}>Última: {lastSync}</div>}
        </>
    );
}
