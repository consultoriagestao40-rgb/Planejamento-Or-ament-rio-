'use client';

import { useState } from 'react';
import { testDatabaseConnection, resetDatabase } from '@/actions/test-db';

export function TestDbButton() {
    const [status, setStatus] = useState<string>('');

    const runTest = async () => {
        setStatus('Testando...');
        const result = await testDatabaseConnection();
        if (result.success) {
            setStatus(`✅ Sucesso! Gravou no banco.`);
            // alert(result.message);
        } else {
            setStatus(`❌ Erro ao gravar: ${result.error}`);
            alert(result.error);
        }
    };

    const runReset = async () => {
        if (!confirm("Tem certeza? Isso apaga todas as conexões.")) return;
        setStatus('Limpando...');
        const result = await resetDatabase();
        if (result.success) {
            setStatus(`🗑️ Banco Limpo! Atualize a página.`);
            alert("Banco limpo. Atualize a página para conectar novamente.");
        } else {
            setStatus(`❌ Erro ao limpar: ${result.error}`);
        }
    };

    return (
        <div style={{ marginTop: '1rem', display: 'flex', gap: '10px' }}>
            <button
                onClick={runTest}
                style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#eab308',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.8rem'
                }}
            >
                🛠️ Testar Escrita
            </button>

            <button
                onClick={runReset}
                style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.8rem'
                }}
            >
                🗑️ Limpar Banco (Reset)
            </button>

            {status && <span style={{ marginLeft: '10px', fontSize: '0.8rem', fontWeight: 'bold' }}>{status}</span>}
        </div>
    );
}
