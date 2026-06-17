'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

const MONTHS = [
    { value: 1, label: 'Janeiro' }, { value: 2, label: 'Fevereiro' },
    { value: 3, label: 'Março' }, { value: 4, label: 'Abril' },
    { value: 5, label: 'Maio' }, { value: 6, label: 'Junho' },
    { value: 7, label: 'Julho' }, { value: 8, label: 'Agosto' },
    { value: 9, label: 'Setembro' }, { value: 10, label: 'Outubro' },
    { value: 11, label: 'Novembro' }, { value: 12, label: 'Dezembro' },
];

interface Tenant {
    id: string;
    name: string;
    cnpj?: string;
    accessToken?: string;
    tokenExpiresAt?: string;
}

export default function SyncPage() {
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [selectedTenant, setSelectedTenant] = useState<string>('ALL');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [startMonth, setStartMonth] = useState(new Date().getMonth() + 1);
    const [endMonth, setEndMonth] = useState(new Date().getMonth() + 1);
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [report, setReport] = useState<any[]>([]);
    const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
    const [authUrl, setAuthUrl] = useState<string>('');

    useEffect(() => {
        fetch('/api/companies')
            .then(r => r.json())
            .then(d => {
                if (d.success) setTenants(d.companies || []);
            });
        fetch('/api/auth/url')
            .then(r => r.json())
            .then(d => { if (d.url) setAuthUrl(d.url); })
            .catch(() => {});
    }, []);

    const handleSync = async () => {
        if (startMonth > endMonth) {
            alert('Mês inicial não pode ser maior que o mês final.');
            return;
        }
        setLoading(true);
        setStatus('running');
        setLogs([`[${new Date().toLocaleTimeString()}] Iniciando sincronização...`]);
        setReport([]);

        try {
            const params = new URLSearchParams({
                year: String(selectedYear),
                startMonth: String(startMonth),
                endMonth: String(endMonth),
                ...(selectedTenant !== 'ALL' ? { tenantId: selectedTenant } : {})
            });

            const res = await fetch(`/api/cron/sync?${params}`);
            const data = await res.json();

            if (data.success) {
                setLogs(data.logs || []);
                setReport(data.report || []);
                setStatus('success');
            } else {
                setLogs([`[ERRO] ${data.error}`]);
                setStatus('error');
            }
        } catch (e: any) {
            setLogs([`[ERRO] ${e.message}`]);
            setStatus('error');
        } finally {
            setLoading(false);
        }
    };

    const isTokenExpired = (t: Tenant) => {
        if (!t.tokenExpiresAt) return true;
        return new Date(t.tokenExpiresAt) < new Date();
    };

    const statusColor = status === 'success' ? '#22c55e' : status === 'error' ? '#ef4444' : status === 'running' ? '#f59e0b' : 'var(--text-muted)';
    const statusLabel = status === 'success' ? '✅ Concluído' : status === 'error' ? '❌ Erro' : status === 'running' ? '⏳ Sincronizando...' : '⬤ Aguardando';

    return (
        <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: 'Inter, system-ui, sans-serif', padding: '2.5rem 2rem' }}>
            <div style={{ maxWidth: '900px', margin: '0 auto' }}>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2.5rem', borderBottom: '1px solid var(--border-default)', paddingBottom: '1.5rem' }}>
                    <div>
                        <h1 className="brand-text" style={{ fontSize: '2rem', marginBottom: '0.4rem', background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            🔄 Sincronização Conta Azul
                        </h1>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                            Importe dados realizados via API. Dados do Excel (Jan→Mai) são preservados automaticamente.
                        </p>
                    </div>
                    <Link href="/" className="btn btn-secondary" style={{ padding: '0.75rem 1.25rem' }}>⬅️ Dashboard</Link>
                </div>

                {/* Status das Empresas */}
                <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius)', padding: '1.5rem', marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>🏢 Status das Conexões</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {tenants.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Carregando empresas...</p>}
                        {tenants.map(t => {
                            const expired = isTokenExpired(t);
                            return (
                                <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'var(--bg-elevated)', borderRadius: '8px', border: `1px solid ${expired ? '#ef444440' : '#22c55e40'}` }}>
                                    <div>
                                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{t.name}</span>
                                        {t.cnpj && <span style={{ marginLeft: '0.75rem', color: 'var(--text-muted)', fontSize: '0.78rem' }}>{t.cnpj}</span>}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: expired ? '#ef4444' : '#22c55e', background: expired ? '#ef444415' : '#22c55e15', padding: '0.25rem 0.75rem', borderRadius: '99px' }}>
                                            {expired ? '🔴 Token Expirado' : '🟢 Conectado'}
                                        </span>
                                        {expired && authUrl && (
                                            <a href={authUrl} className="btn btn-primary" style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }}>
                                                Reconectar
                                            </a>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Proteção */}
                <div style={{ backgroundColor: '#22c55e10', border: '1px solid #22c55e40', borderRadius: 'var(--radius)', padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '1.25rem' }}>🛡️</span>
                    <div>
                        <p style={{ fontWeight: 700, fontSize: '0.9rem', color: '#22c55e', marginBottom: '0.25rem' }}>Proteção de Dados Ativa</p>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            Somente registros com origem na API (prefixo <code style={{ background: 'var(--bg-elevated)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>sync-</code>) serão substituídos.
                            Dados importados via Excel têm <code style={{ background: 'var(--bg-elevated)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>externalId = NULL</code> e <strong>nunca são apagados</strong>.
                            Orçamentos também são intocados.
                        </p>
                    </div>
                </div>

                {/* Controles de Sync */}
                <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius)', padding: '1.5rem', marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem', color: 'var(--text-primary)' }}>⚙️ Configurar Sincronização</h2>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                        {/* Empresa */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Empresa</label>
                            <select value={selectedTenant} onChange={e => setSelectedTenant(e.target.value)}
                                style={{ width: '100%', padding: '0.6rem 0.875rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                                <option value="ALL">Todas as Empresas</option>
                                {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </div>

                        {/* Ano */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Ano</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-elevated)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
                                <button onClick={() => setSelectedYear(y => y - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.25rem 0.5rem', fontSize: '1rem' }}>◀</button>
                                <span style={{ flex: 1, textAlign: 'center', fontWeight: 800, fontFamily: 'monospace', fontSize: '0.95rem' }}>{selectedYear}</span>
                                <button onClick={() => setSelectedYear(y => y + 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.25rem 0.5rem', fontSize: '1rem' }}>▶</button>
                            </div>
                        </div>

                        {/* Mês Inicial */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Mês Inicial</label>
                            <select value={startMonth} onChange={e => setStartMonth(Number(e.target.value))}
                                style={{ width: '100%', padding: '0.6rem 0.875rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                                {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                        </div>

                        {/* Mês Final */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Mês Final</label>
                            <select value={endMonth} onChange={e => setEndMonth(Number(e.target.value))}
                                style={{ width: '100%', padding: '0.6rem 0.875rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                                {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Resumo do escopo */}
                    <div style={{ background: 'var(--bg-elevated)', borderRadius: '8px', padding: '0.875rem 1.25rem', marginBottom: '1.25rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        <strong style={{ color: 'var(--text-primary)' }}>Escopo:</strong> Sincronizar{' '}
                        <strong style={{ color: 'var(--accent)' }}>{MONTHS[startMonth - 1]?.label}→{MONTHS[endMonth - 1]?.label} de {selectedYear}</strong>
                        {selectedTenant !== 'ALL' && <> para <strong style={{ color: 'var(--accent)' }}>{tenants.find(t => t.id === selectedTenant)?.name}</strong></>}
                        {selectedTenant === 'ALL' && <> para <strong style={{ color: 'var(--accent)' }}>todas as empresas</strong></>}
                        . Dados do Excel (meses anteriores ao intervalo) serão preservados.
                    </div>

                    <button
                        onClick={handleSync}
                        disabled={loading}
                        className="btn btn-primary"
                        style={{ width: '100%', padding: '0.875rem', fontSize: '1rem', fontWeight: 700, opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
                    >
                        {loading ? '⏳ Sincronizando...' : '🔄 Iniciar Sincronização'}
                    </button>
                </div>

                {/* Status + Logs */}
                {(logs.length > 0 || report.length > 0) && (
                    <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius)', padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>📋 Resultado</h2>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: statusColor }}>{statusLabel}</span>
                        </div>

                        {/* Relatório */}
                        {report.length > 0 && (
                            <div style={{ marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {report.map((r, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 1rem', background: 'var(--bg-elevated)', borderRadius: '6px', fontSize: '0.85rem' }}>
                                        <span style={{ fontWeight: 600 }}>{r.tenant} — {r.mode}</span>
                                        {r.error
                                            ? <span style={{ color: '#ef4444' }}>❌ {r.error}</span>
                                            : <span style={{ color: '#22c55e', fontWeight: 700 }}>✅ {r.count} registros (meses {r.months})</span>
                                        }
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Logs */}
                        <div style={{ background: '#0a0a0a', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '1rem', maxHeight: '300px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.78rem', lineHeight: 1.8, color: '#a3e635' }}>
                            {logs.map((log, i) => (
                                <div key={i} style={{ color: log.includes('[ERROR]') ? '#ef4444' : log.includes('✅') ? '#22c55e' : '#a3e635' }}>
                                    {log}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
