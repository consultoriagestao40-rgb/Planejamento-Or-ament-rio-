'use client';

import React, { useState } from 'react';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await fetch('/api/auth/internal-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await res.json();

            if (data.success) {
                window.location.href = '/';
            } else {
                setError(data.error || 'Credenciais inválidas');
            }
        } catch (err) {
            setError('Erro ao conectar ao servidor');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--bg-base)',
            position: 'relative',
            overflow: 'hidden',
        }}>
            {/* Background decorative elements - Soft & Modern */}
            <div style={{
                position: 'absolute',
                width: '80vw', height: '80vw',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(37, 99, 235, 0.03) 0%, transparent 70%)',
                top: '-20%', left: '-20%',
                pointerEvents: 'none'
            }} />
            <div style={{
                position: 'absolute',
                width: '60vw', height: '60vw',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(79, 70, 229, 0.04) 0%, transparent 70%)',
                bottom: '-10%', right: '-10%',
                pointerEvents: 'none'
            }} />

            {/* Login Card */}
            <div className="animate-slide-up" style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-card)',
                width: '100%',
                maxWidth: '440px',
                padding: '3rem',
                position: 'relative',
                zIndex: 1
            }}>
                {/* Brand */}
                <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                    <div style={{ 
                        width: '48px', height: '48px', 
                        background: 'var(--gradient-brand)', 
                        borderRadius: '12px', 
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 1.25rem',
                        boxShadow: 'var(--shadow-blue)'
                    }}>
                        <span style={{ fontSize: '1.5rem' }}>📊</span>
                    </div>
                    <h1 className="brand-text" style={{ fontSize: '2.25rem', marginBottom: '0.75rem' }}>Budget Hub</h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', fontWeight: 500 }}>Gestão Orçamentária Inteligente</p>
                </div>

                {error && (
                    <div className="animate-fade-in" style={{
                        background: 'rgba(220, 38, 38, 0.05)',
                        border: '1px solid var(--accent-red-glow)',
                        color: 'var(--accent-red)',
                        padding: '1rem',
                        borderRadius: 'var(--radius-sm)',
                        marginBottom: '1.5rem',
                        fontSize: '0.875rem',
                        textAlign: 'center',
                        fontWeight: 600
                    }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label style={{
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem'
                        }}>
                             E-mail
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            className="premium-input"
                            style={{ width: '100%', height: '48px' }}
                            placeholder="admin@budgethub.com"
                        />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label style={{
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem'
                        }}>
                             Senha
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            className="premium-input"
                            style={{ width: '100%', height: '48px' }}
                            placeholder="••••••••"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="btn btn-primary"
                        style={{
                            marginTop: '0.75rem',
                            width: '100%',
                            height: '52px',
                            justifyContent: 'center',
                            fontSize: '1.05rem',
                            borderRadius: 'var(--radius-sm)',
                            opacity: loading ? 0.7 : 1,
                        }}
                    >
                        {loading ? (
                            <>
                                <span className="spinner" style={{ width: '18px', height: '18px', borderTopColor: 'white' }} />
                                Processando...
                            </>
                        ) : 'Acessar Painel'}
                    </button>
                </form>

                <div style={{ marginTop: '2.5rem', textAlign: 'center' }}>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        © {new Date().getFullYear()} • Consultoria Gestão 4.0
                    </p>
                </div>
            </div>
        </div>
    );
}
