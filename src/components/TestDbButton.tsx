'use client';

import { useState } from 'react';
import { testDatabaseConnection } from '@/actions/test-db';

export function TestDbButton() {
    const [status, setStatus] = useState<string>('');

    const runTest = async () => {
        setStatus('Testando...');
        const result = await testDatabaseConnection();
        if (result.success) {
            setStatus(`✅ Sucesso! Gravou no banco.`);
            alert(result.message);
        } else {
            setStatus(`❌ Erro ao gravar: ${result.error}`);
            alert(result.error);
        }
    };

    return (
        <div style={{ marginTop: '1rem' }}>
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
                🛠️ Testar Escrita no Banco
            </button>
            {status && <span style={{ marginLeft: '10px', fontSize: '0.8rem', fontWeight: 'bold' }}>{status}</span>}
        </div>
    );
}
