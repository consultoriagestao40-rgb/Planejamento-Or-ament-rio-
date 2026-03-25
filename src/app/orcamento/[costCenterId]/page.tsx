'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import BudgetEntryGrid from '@/components/BudgetEntryGrid';

export default function BudgetEntryPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const rawId = params.costCenterId as string;
    const yearParam = searchParams.get('year');
    const year = yearParam ? parseInt(yearParam) : new Date().getFullYear();

    // Fix: extract actual CC ID if combined (tenantId:ccId)
    const costCenterId = rawId.includes('%3A') ? rawId.split('%3A')[1] : (rawId.includes(':') ? rawId.split(':')[1] : rawId);

    const [ccName, setCcName] = useState<string>('');
    const [tenantName, setTenantName] = useState<string>('');
    const [taxRate, setTaxRate] = useState<number>(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchCC = async () => {
            try {
                const res = await fetch('/api/setup?t=' + Date.now(), { cache: 'no-store' });
                const data = await res.json();
                if (data.success) {
                    const searchList = data.fullCostCenters || data.costCenters || [];
                    const found = searchList.find((cc: any) => cc.id === costCenterId);
                    if (found) {
                        setCcName((found.name || found.id).replace('[INATIVO] ', ''));
                        setTenantName(found.tenantName || '');
                        setTaxRate(found.taxRate || 0);
                    }
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchCC();
    }, [costCenterId]);

    return (
        <div style={{
            minHeight: '100vh',
            backgroundColor: 'var(--bg-base)',
            color: 'var(--text-primary)',
            fontFamily: 'Inter, system-ui, sans-serif'
        }}>
            {/* Top Nav Bar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1rem 2rem',
                borderBottom: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-card)',
                backdropFilter: 'blur(12px)',
                position: 'sticky',
                top: 0,
                zIndex: 100,
                boxShadow: 'var(--shadow-card)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <Link
                        href="/summary"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            color: 'var(--text-muted)',
                            textDecoration: 'none',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            padding: '0.5rem 0.85rem',
                            borderRadius: '8px',
                            border: '1px solid var(--border-subtle)',
                            transition: 'all 0.15s ease',
                            backgroundColor: 'var(--bg-surface)'
                        }}
                    >
                        ← Resumo
                    </Link>
                    <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.2rem' }}>
                            {tenantName || 'Lançamento de Orçamento'}
                        </div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                            {loading ? '...' : ccName || costCenterId}
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        padding: '0.4rem 1rem',
                        borderRadius: '99px',
                        background: 'rgba(16, 185, 129, 0.1)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        color: 'var(--accent-green)',
                        fontSize: '0.8rem',
                        fontWeight: 700
                    }}>
                        🏷️ Taxa: {taxRate > 0 ? taxRate : 12.5}%
                    </div>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.4rem 1rem',
                        borderRadius: '99px',
                        background: 'rgba(59, 130, 246, 0.1)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        color: 'var(--accent-blue)',
                        fontSize: '0.8rem',
                        fontWeight: 700
                    }}>
                        📅 {year}
                    </div>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.4rem 1rem',
                        borderRadius: '99px',
                        background: 'rgba(99, 102, 241, 0.08)',
                        border: '1px solid rgba(99, 102, 241, 0.2)',
                        color: 'var(--accent-indigo)',
                        fontSize: '0.8rem',
                        fontWeight: 700
                    }}>
                        📝 Modo Orçamento
                    </div>
                </div>
            </div>

            {/* Budget Grid */}
            <BudgetEntryGrid
                costCenterId={costCenterId}
                year={year}
                taxRate={taxRate > 0 ? taxRate : 12.5}
            />
        </div>
    );
}
