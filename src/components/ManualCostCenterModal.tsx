'use client';

import React, { useState } from 'react';

interface ManualCostCenterModalProps {
    tenantId: string;
    tenantName: string;
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function ManualCostCenterModal({ tenantId, tenantName, isOpen, onClose, onSuccess }: ManualCostCenterModalProps) {
    const [name, setName] = useState('');
    const [customId, setCustomId] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSave = async () => {
        if (!name.trim()) {
            setError('O nome é obrigatório.');
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/cost-centers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, tenantId, customId: customId.trim() || undefined })
            });

            const data = await res.json();
            if (data.success) {
                onSuccess();
                onClose();
                setName('');
                setCustomId('');
            } else {
                setError(data.error || 'Erro ao criar Centro de Custo.');
            }
        } catch (err: any) {
            setError('Falha na comunicação com o servidor.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000
        }}>
            <div className="modal-content" style={{
                background: '#fff', padding: '2rem', borderRadius: '16px', width: '100%', maxWidth: '500px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#1e293b' }}>Novo Centro de Custo</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
                </div>

                <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.5rem' }}>
                    Empresa: <strong>{tenantName}</strong>
                </p>

                <div style={{ marginBottom: '1.25rem' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.5rem' }}>NOME (IGUAL AO CONTA AZUL)</label>
                    <input 
                        type="text" 
                        value={name} 
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Ex: Administração - Sede"
                        style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '1rem' }}
                    />
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.5rem' }}>ID DO CONTA AZUL (OPCIONAL)</label>
                    <input 
                        type="text" 
                        value={customId} 
                        onChange={(e) => setCustomId(e.target.value)}
                        placeholder="UUID do Conta Azul (se souber)"
                        style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '1rem' }}
                    />
                </div>

                {error && <div style={{ color: '#ef4444', fontSize: '0.875rem', marginBottom: '1rem', background: '#fef2f2', padding: '0.75rem', borderRadius: '8px' }}>{error}</div>}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
                    <button 
                        onClick={onClose} 
                        style={{ padding: '0.75rem 1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, cursor: 'pointer' }}
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleSave} 
                        disabled={loading}
                        style={{ 
                            padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', 
                            background: loading ? '#94a3b8' : 'var(--accent-blue, #2563eb)', 
                            color: '#fff', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: '0.5rem'
                        }}
                    >
                        {loading ? 'Salvando...' : 'Salvar Centro de Custo'}
                    </button>
                </div>
            </div>
        </div>
    );
}
