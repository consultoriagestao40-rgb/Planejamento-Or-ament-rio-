'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

interface SummaryItem {
    tenantId: string;
    tenantName: string;
    costCenterId: string;
    costCenterName: string;
    totalRevenue: number;
    totalExpense: number;
    hasBudget: boolean;
}

export default function BudgetSummaryPage() {
    const [data, setData] = useState<SummaryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch('/api/cost-centers/summary');
                const result = await res.json();
                if (result.success) {
                    setData(result.data);
                } else {
                    setError(result.error);
                }
            } catch (e: any) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const filteredData = useMemo(() => {
        if (!searchTerm) return data;
        const lowTerm = searchTerm.toLowerCase();
        return data.filter(item =>
            item.tenantName.toLowerCase().includes(lowTerm) ||
            item.costCenterName.toLowerCase().includes(lowTerm)
        );
    }, [data, searchTerm]);

    const stats = useMemo(() => {
        const totalCCs = data.length;
        const withBudget = data.filter(i => i.hasBudget).length;
        const withoutBudget = totalCCs - withBudget;
        return { totalCCs, withBudget, withoutBudget };
    }, [data]);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: 2
        }).format(value);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-400 font-medium anim-pulse">Carregando resumo estratégico...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-900 text-slate-200 p-6 md:p-10 font-[var(--font-inter)]">
            <div className="max-w-7xl mx-auto space-y-8">

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-slate-800 pb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
                            <span className="text-blue-500 text-4xl">📊</span> Resumo de Orçamentos por CC
                        </h1>
                        <p className="text-slate-400 mt-2 text-lg">Acompanhamento anual consolidado de todas as unidades.</p>
                    </div>
                    <Link href="/" className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-all flex items-center gap-2 border border-slate-700 shadow-xl font-medium">
                        <span>⬅️</span> Voltar ao Painel
                    </Link>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700/50 shadow-sm">
                        <p className="text-slate-400 text-sm font-semibold uppercase tracking-wider">Total de Centros de Custo</p>
                        <p className="text-4xl font-bold text-white mt-2">{stats.totalCCs}</p>
                    </div>
                    <div className="bg-emerald-900/20 p-6 rounded-2xl border border-emerald-500/30 shadow-sm">
                        <p className="text-emerald-400 text-sm font-semibold uppercase tracking-wider">Com Orçamento Lançado</p>
                        <p className="text-4xl font-bold text-emerald-400 mt-2">{stats.withBudget}</p>
                    </div>
                    <div className="bg-rose-900/20 p-6 rounded-2xl border border-rose-500/30 shadow-sm">
                        <p className="text-rose-400 text-sm font-semibold uppercase tracking-wider">Pendente de Lançamento</p>
                        <p className="text-4xl font-bold text-rose-400 mt-2">{stats.withoutBudget}</p>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-700/50 flex items-center gap-4">
                    <span className="text-slate-400">🔍</span>
                    <input
                        type="text"
                        placeholder="Filtrar por empresa ou centro de custo..."
                        className="bg-transparent border-none outline-none text-white w-full placeholder:text-slate-500 text-lg"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* Table */}
                <div className="bg-slate-800/40 rounded-3xl border border-slate-700/50 overflow-hidden shadow-2xl backdrop-blur-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-800 text-slate-400 text-sm font-bold uppercase tracking-widest border-b border-slate-700">
                                    <th className="px-8 py-5">Empresa</th>
                                    <th className="px-8 py-5">Centro de Custo</th>
                                    <th className="px-8 py-5 text-right">Receita Anual</th>
                                    <th className="px-8 py-5 text-right">Despesa Anual</th>
                                    <th className="px-8 py-5 text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredData.length > 0 ? filteredData.map((item, idx) => (
                                    <tr
                                        key={`${item.tenantId}-${item.costCenterId}`}
                                        className={`
                                            group border-b border-slate-800/50 hover:bg-slate-700/30 transition-colors
                                            ${!item.hasBudget ? 'bg-rose-900/5' : ''}
                                        `}
                                    >
                                        <td className="px-8 py-5 font-medium text-slate-300 group-hover:text-white transition-colors">{item.tenantName}</td>
                                        <td className="px-8 py-5 font-bold text-slate-100 group-hover:text-blue-400 transition-colors">{item.costCenterName}</td>
                                        <td className="px-8 py-5 text-right font-mono text-emerald-500 tabular-nums">
                                            {item.totalRevenue > 0 ? formatCurrency(item.totalRevenue) : '-'}
                                        </td>
                                        <td className="px-8 py-5 text-right font-mono text-rose-500 tabular-nums">
                                            {item.totalExpense > 0 ? formatCurrency(item.totalExpense) : '-'}
                                        </td>
                                        <td className="px-8 py-5 text-center">
                                            {item.hasBudget ? (
                                                <span className="px-4 py-1.5 bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-full border border-emerald-500/20 shadow-sm">
                                                    LANÇADO
                                                </span>
                                            ) : (
                                                <span className="px-4 py-1.5 bg-rose-500/20 text-rose-400 text-xs font-bold rounded-full border border-rose-500/20 shadow-sm">
                                                    PENDENTE
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={5} className="px-8 py-20 text-center text-slate-500 text-lg italic">
                                            Nenhum resultado encontrado para "{searchTerm}"
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="text-center pb-10">
                    <p className="text-slate-500 text-sm tracking-wide">
                        VISTO EM {new Date().toLocaleDateString('pt-BR')} • DADOS Sincronizados com Conta Azul
                    </p>
                </div>
            </div>

            <style jsx>{`
                @keyframes pulse-slow {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                .anim-pulse {
                    animation: pulse-slow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                }
            `}</style>
        </div>
    );
}
