'use client';

import React, { useState, useEffect, useRef } from 'react';

interface Message {
    id: string;
    role: 'user' | 'model';
    content: string;
    suggestedAction?: any;
}

export default function CFOVirtualPage() {
    const [tenants, setTenants] = useState<any[]>([]);
    const [selectedTenant, setSelectedTenant] = useState<string>('all');
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
    // Action Plan saving states
    const [actionSavingId, setActionSavingId] = useState<string | null>(null);
    const [actionSavedIds, setActionSavedIds] = useState<Set<string>>(new Set());

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Load tenants on mount
    useEffect(() => {
        const loadSetup = async () => {
            try {
                const res = await fetch('/api/setup');
                const setup = await res.json();
                if (setup.success && setup.tenants) {
                    setTenants(setup.tenants);
                    
                    const cached = localStorage.getItem('selectedTenantId');
                    if (cached && (cached === 'all' || setup.tenants.some((t: any) => t.id === cached))) {
                        setSelectedTenant(cached);
                    } else {
                        setSelectedTenant('all'); // Default to consolidated/all
                    }
                }
            } catch (err) {
                console.error('Erro ao carregar tenants:', err);
            }
        };
        loadSetup();
    }, []);

    // Save tenant back to localStorage when changed
    useEffect(() => {
        if (selectedTenant) {
            localStorage.setItem('selectedTenantId', selectedTenant);
        }
    }, [selectedTenant]);

    // Auto-scroll on chat update
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isLoading]);

    // Initial greeting
    useEffect(() => {
        if (messages.length === 0) {
            setMessages([
                {
                    id: 'greeting',
                    role: 'model',
                    content: 'Olá! Sou o seu **CFO Virtual de IA** do BudgetHub.\n\nEstou pronto para analisar seu fluxo de caixa (DFC), auditar desvios de orçamento (orçado vs realizado competência) e identificar gargalos financeiros de forma individual ou consolidada.\n\nSelecione o filtro de empresa no topo e clique em um dos tópicos rápidos abaixo ou faça uma pergunta direta.'
                }
            ]);
        }
    }, [messages.length]);

    const sendMessage = async (text: string) => {
        if (!text.trim() || isLoading) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: text
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
                    tenantId: selectedTenant
                })
            });

            const data = await response.json();

            if (data.success) {
                setMessages(prev => [...prev, {
                    id: (Date.now() + 1).toString(),
                    role: 'model',
                    content: data.text,
                    suggestedAction: data.suggestedAction
                }]);
            } else {
                setMessages(prev => [...prev, {
                    id: (Date.now() + 1).toString(),
                    role: 'model',
                    content: `⚠️ **Erro**: ${data.error || 'Não foi possível obter resposta.'}`
                }]);
            }
        } catch (error) {
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'model',
                content: '⚠️ **Erro**: Conexão falhou. Por favor, tente novamente.'
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateAction = async (action: any, msgId: string) => {
        setActionSavingId(msgId);
        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    actionType: 'CREATE_ACTION',
                    tenantId: selectedTenant,
                    categoryId: action.categoryId,
                    month: action.month,
                    year: action.year,
                    description: action.description,
                    actionText: action.actionText
                })
            });

            const data = await res.json();
            if (data.success) {
                setActionSavedIds(prev => {
                    const next = new Set(prev);
                    next.add(msgId);
                    return next;
                });
                alert('🚀 Plano de ação registrado com sucesso no painel de metas da categoria!');
            } else {
                alert(`Erro ao criar plano: ${data.error}`);
            }
        } catch (err) {
            alert('Falha na comunicação com o servidor.');
        } finally {
            setActionSavingId(null);
        }
    };

    const quickChips = [
        { label: '🔎 Desvios de orçamento (Junho)', text: 'Auditar principais desvios de orçamento de junho de 2026' },
        { label: '💸 Onde estamos perdendo dinheiro?', text: 'Identifique quais contas estão com maiores estouros de orçamento até o momento' },
        { label: '📊 Saúde do fluxo de caixa', text: 'Analise a saúde do fluxo de caixa (DFC) para este ano de 2026' },
        { label: '🔮 Previsão de caixa e runway', text: 'Faça uma projeção de saldo de caixa para os próximos meses com base nas médias' }
    ];

    // Helper formatting functions
    const formatBRL = (val: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    };

    const getMonthName = (m: number) => {
        const names = [
            'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
            'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
        ];
        return names[m - 1] || `M${m}`;
    };

    // Inline style parser
    const parseInlineStyles = (text: string): React.ReactNode[] => {
        const regex = /(\*\*.*?\*\*|`.*?`|\[.*?\]\(.*?\))/g;
        const matches = text.split(regex);

        return matches.map((part, index) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={index} style={{ fontWeight: 700, color: '#0f172a' }}>{part.slice(2, -2)}</strong>;
            }
            if (part.startsWith('`') && part.endsWith('`')) {
                return <code key={index} style={{ fontFamily: 'monospace', backgroundColor: '#e2e8f0', padding: '2px 4px', borderRadius: '4px', fontSize: '0.8rem', color: '#be123c' }}>{part.slice(1, -1)}</code>;
            }
            if (part.startsWith('[') && part.includes('](')) {
                const label = part.slice(1, part.indexOf(']'));
                const url = part.slice(part.indexOf('](') + 2, -1);
                return <a key={index} href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', textDecoration: 'underline' }}>{label}</a>;
            }
            return part;
        });
    };

    // Markdown block parser
    const parseMarkdown = (text: string) => {
        if (!text) return null;
        
        // Strip out the json block so it isn't rendered in the text bubble
        const cleanText = text.replace(/```json[\s\S]*?```/g, '').trim();

        const lines = cleanText.split('\n');
        const elements: React.ReactNode[] = [];
        
        let inTable = false;
        let tableHeaders: string[] = [];
        let tableRows: string[][] = [];
        let listItems: string[] = [];
        let inList = false;

        const flushList = (key: string) => {
            if (listItems.length > 0) {
                elements.push(
                    <ul key={`ul-${key}`} style={{ paddingLeft: '20px', margin: '8px 0', listStyleType: 'disc' }}>
                        {listItems.map((item, idx) => (
                            <li key={idx} style={{ marginBottom: '4px', fontSize: '0.85rem', color: '#334155' }}>
                                {parseInlineStyles(item)}
                            </li>
                        ))}
                    </ul>
                );
                listItems = [];
            }
            inList = false;
        };

        const flushTable = (key: string) => {
            if (tableHeaders.length > 0 || tableRows.length > 0) {
                elements.push(
                    <div key={`table-wrapper-${key}`} style={{ overflowX: 'auto', margin: '12px 0', borderRadius: '8px', border: '1px solid #cbd5e1', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                                    {tableHeaders.map((h, idx) => (
                                        <th key={idx} style={{ padding: '8px 12px', fontWeight: 600, color: '#475569' }}>{h.trim()}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {tableRows.map((row, rIdx) => (
                                    <tr key={rIdx} style={{ borderBottom: rIdx === tableRows.length - 1 ? 'none' : '1px solid #f1f5f9', backgroundColor: rIdx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                                        {row.map((cell, cIdx) => (
                                            <td key={cIdx} style={{ padding: '8px 12px', color: '#334155' }}>
                                                {parseInlineStyles(cell.trim())}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
                tableHeaders = [];
                tableRows = [];
            }
            inTable = false;
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (line.startsWith('|')) {
                flushList(`tbl-${i}`);
                inTable = true;
                const parts = line.split('|').map(p => p.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
                
                const isSeparator = parts.every(p => p.startsWith('-') || p.includes('---'));
                if (isSeparator) {
                    continue;
                }
                
                if (tableHeaders.length === 0) {
                    tableHeaders = parts;
                } else {
                    tableRows.push(parts);
                }
                continue;
            } else if (inTable) {
                flushTable(`tbl-end-${i}`);
            }

            if (line.startsWith('- ') || line.startsWith('* ')) {
                inList = true;
                listItems.push(line.substring(2));
                continue;
            } else if (inList) {
                flushList(`list-end-${i}`);
            }

            if (line.startsWith('### ')) {
                elements.push(<h4 key={i} style={{ margin: '12px 0 6px 0', fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{parseInlineStyles(line.substring(4))}</h4>);
                continue;
            }
            if (line.startsWith('## ')) {
                elements.push(<h3 key={i} style={{ margin: '16px 0 8px 0', fontSize: '1rem', fontWeight: 700, color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>{parseInlineStyles(line.substring(3))}</h3>);
                continue;
            }
            if (line.startsWith('# ')) {
                elements.push(<h2 key={i} style={{ margin: '18px 0 8px 0', fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>{parseInlineStyles(line.substring(2))}</h2>);
                continue;
            }

            if (line === '') {
                continue;
            }

            elements.push(<p key={i} style={{ margin: '6px 0', fontSize: '0.85rem', lineHeight: 1.5, color: '#334155' }}>{parseInlineStyles(line)}</p>);
        }

        flushList('final');
        flushTable('final');

        return elements;
    };

    // Parse visual payload JSON directly from message content to render inline charts
    const getVisualPayload = (content: string) => {
        try {
            if (!content) return null;
            // 1. Try to extract content inside ```json ... ```
            const jsonRegex = /```json\s*([\s\S]*?)\s*```/;
            const match = jsonRegex.exec(content);
            let jsonText = "";
            if (match) {
                jsonText = match[1].trim();
            } else {
                // If not enclosed in ```json, find the first '{' and last '}'
                const firstBrace = content.indexOf('{');
                const lastBrace = content.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                    jsonText = content.substring(firstBrace, lastBrace + 1).trim();
                }
            }

            if (jsonText) {
                // Remove javascript single-line and multi-line comments
                jsonText = jsonText.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
                
                // Remove trailing commas before closing braces/brackets
                jsonText = jsonText.replace(/,(\s*[\]}])/g, '$1');
                
                // Attempt parsing
                try {
                    const parsed = JSON.parse(jsonText);
                    if (parsed && typeof parsed === 'object' && parsed.type) {
                        const validTypes = ['CASH_FLOW', 'DEVIATIONS', 'MONTHLY_BREAKDOWN', 'OVERDUE_COMMITMENTS', 'SHORT_TERM_PROJECTION'];
                        if (validTypes.includes(parsed.type)) {
                            return parsed;
                        }
                    }
                } catch (e) {
                    // Try to clean single quotes or unquoted keys if JSON.parse failed
                    console.warn('CFO: Standard JSON parsing failed, applying cleanup replacements...', e);
                    let cleaned = jsonText
                        .replace(/'([^'\n]+)'\s*:/g, '"$1":')
                        .replace(/:\s*'([^'\n]+)'/g, ': "$1"');
                    const parsed = JSON.parse(cleaned);
                    if (parsed && typeof parsed === 'object' && parsed.type) {
                        return parsed;
                    }
                }
            }
        } catch (err) {
            console.error('Erro ao analisar payload do gráfico:', err, content);
        }
        return null;
    };

    // Renders the Cash Flow chart directly inline in the message bubble
    const renderCashFlowChart = (payload: any) => {
        if (!payload || !payload.monthlyCashFlow || payload.monthlyCashFlow.length === 0) return null;
        
        return (
            <div className="glass-card" style={{ marginTop: '1rem', padding: '1.5rem', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid rgba(15,23,42,0.08)', animation: 'fade-in 0.3s ease-out' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1e293b', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📈 Fluxo de Caixa Mensal (DFC Base Caixa)</span>
                </h3>

                {/* SVG Columns Bar Chart */}
                <div style={{ height: '180px', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', borderBottom: '1px solid rgba(15, 23, 42, 0.08)', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: '1rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', zIndex: 0, pointerEvents: 'none' }}>
                        <div style={{ borderBottom: '1px dashed rgba(15, 23, 42, 0.03)', width: '100%', height: '0' }} />
                        <div style={{ borderBottom: '1px dashed rgba(15, 23, 42, 0.03)', width: '100%', height: '0' }} />
                        <div style={{ borderBottom: '1px dashed rgba(15, 23, 42, 0.03)', width: '100%', height: '0' }} />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: '100%', zIndex: 1, padding: '0 4px' }}>
                        {payload.monthlyCashFlow.map((item: any) => {
                            const maxAmount = Math.max(1, ...payload.monthlyCashFlow.map((i: any) => Math.max(i.inflow, i.outflow)));
                            const inflowHeight = (item.inflow / maxAmount) * 100;
                            const outflowHeight = (item.outflow / maxAmount) * 100;

                            return (
                                <div key={item.month} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, maxWidth: '45px' }}>
                                    <div style={{ display: 'flex', gap: '3px', alignItems: 'flex-end', height: '120px', width: '100%' }}>
                                        {/* Inflow */}
                                        <div 
                                            style={{ flex: 1, height: `${inflowHeight}%`, backgroundColor: '#10b981', borderRadius: '3px 3px 0 0', minHeight: '1px', cursor: 'pointer', position: 'relative' }}
                                            className="dfc-bar"
                                            title={`Entradas: ${formatBRL(item.inflow)}`}
                                        >
                                            <div className="dfc-tooltip">{formatBRL(item.inflow)}</div>
                                        </div>
                                        {/* Outflow */}
                                        <div 
                                            style={{ flex: 1, height: `${outflowHeight}%`, backgroundColor: '#ef4444', borderRadius: '3px 3px 0 0', minHeight: '1px', cursor: 'pointer', position: 'relative' }}
                                            className="dfc-bar"
                                            title={`Saídas: ${formatBRL(item.outflow)}`}
                                        >
                                            <div className="dfc-tooltip">{formatBRL(item.outflow)}</div>
                                        </div>
                                    </div>
                                    <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, marginTop: '6px' }}>
                                        {getMonthName(item.month)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Summary Metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
                    <div style={{ padding: '8px 10px', borderRadius: '8px', backgroundColor: '#f0fdf4', border: '1px solid #dcfce7', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.65rem', color: '#16a34a', fontWeight: 700 }}>Total Receitas</span>
                        <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#14532d', marginTop: '2px' }}>
                            {formatBRL(payload.monthlyCashFlow.reduce((sum: number, item: any) => sum + item.inflow, 0))}
                        </h4>
                    </div>
                    <div style={{ padding: '8px 10px', borderRadius: '8px', backgroundColor: '#fef2f2', border: '1px solid #fee2e2', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.65rem', color: '#dc2626', fontWeight: 700 }}>Total Despesas</span>
                        <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#7f1d1d', marginTop: '2px' }}>
                            {formatBRL(payload.monthlyCashFlow.reduce((sum: number, item: any) => sum + item.outflow, 0))}
                        </h4>
                    </div>
                    <div style={{ padding: '8px 10px', borderRadius: '8px', backgroundColor: '#eff6ff', border: '1px solid #dbeafe', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.65rem', color: '#2563eb', fontWeight: 700 }}>Líquido Net</span>
                        <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e3a8a', marginTop: '2px' }}>
                            {formatBRL(
                                payload.monthlyCashFlow.reduce((sum: number, item: any) => sum + item.inflow, 0) -
                                payload.monthlyCashFlow.reduce((sum: number, item: any) => sum + item.outflow, 0)
                            )}
                        </h4>
                    </div>
                </div>

                {/* Table details */}
                <div style={{ border: '1px solid rgba(15, 23, 42, 0.08)', borderRadius: '8px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid rgba(15, 23, 42, 0.08)' }}>
                                <th style={{ padding: '6px 10px', fontWeight: 600, color: '#475569' }}>Mês</th>
                                <th style={{ padding: '6px 10px', fontWeight: 600, color: '#10b981', textAlign: 'right' }}>Entradas</th>
                                <th style={{ padding: '6px 10px', fontWeight: 600, color: '#ef4444', textAlign: 'right' }}>Saídas</th>
                                <th style={{ padding: '6px 10px', fontWeight: 600, color: '#3b82f6', textAlign: 'right' }}>Saldo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {payload.monthlyCashFlow.map((item: any) => (
                                <tr key={item.month} style={{ borderBottom: '1px solid rgba(15, 23, 42, 0.04)', backgroundColor: '#ffffff' }}>
                                    <td style={{ padding: '6px 10px', fontWeight: 700, color: '#334155' }}>{getMonthName(item.month)}</td>
                                    <td style={{ padding: '6px 10px', color: '#10b981', textAlign: 'right' }}>{formatBRL(item.inflow)}</td>
                                    <td style={{ padding: '6px 10px', color: '#ef4444', textAlign: 'right' }}>{formatBRL(item.outflow)}</td>
                                    <td style={{ padding: '6px 10px', color: '#475569', textAlign: 'right', fontWeight: 600 }}>{formatBRL(item.projectedBalance)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    // Renders the Deviations progress list inline in the message bubble
    const renderDeviationsChart = (payload: any) => {
        if (!payload || !payload.deviations) return null;

        return (
            <div className="glass-card" style={{ marginTop: '1rem', padding: '1.5rem', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid rgba(15,23,42,0.08)', animation: 'fade-in 0.3s ease-out' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🎯 Desvios de Orçamento: {getMonthName(payload.month)}/{payload.year}</span>
                </h3>
                <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '1.25rem' }}>Dica: Clique em qualquer categoria para detalhar suas transações do mês.</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    {payload.deviations.map((item: any, idx: number) => {
                        const isRevenue = item.type === 'REVENUE';
                        const isNegativeDeviation = item.deviation < 0;

                        const progressVal = Math.min(Math.max(item.percentage, 0), 155);
                        const progressBarColor = isRevenue
                            ? (item.percentage >= 100 ? '#10b981' : '#f59e0b')
                            : (item.percentage > 100 ? '#ef4444' : '#10b981');

                        return (
                            <div 
                                key={item.categoryId || idx} 
                                onClick={() => sendMessage(`Quero ver os detalhes das transações de ${item.categoryName} em ${getMonthName(payload.month)} de ${payload.year}`)}
                                style={{
                                    padding: '10px 12px',
                                    borderRadius: '10px',
                                    border: '1px solid rgba(15, 23, 42, 0.04)',
                                    backgroundColor: '#f8fafc',
                                    cursor: 'pointer',
                                    transition: 'transform 0.15s ease, background-color 0.15s ease'
                                }}
                                className="deviation-row"
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                    <div>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e293b' }}>{item.categoryName}</span>
                                        <span style={{ fontSize: '0.65rem', color: '#64748b', marginLeft: '6px', padding: '2px 4px', borderRadius: '4px', backgroundColor: '#e2e8f0', fontWeight: 700 }}>
                                            {isRevenue ? 'Rec' : 'Desp'}
                                        </span>
                                    </div>
                                    
                                    <div style={{
                                        padding: '3px 6px',
                                        borderRadius: '4px',
                                        fontSize: '0.7rem',
                                        fontWeight: 700,
                                        backgroundColor: isNegativeDeviation ? '#fef2f2' : '#f0fdf4',
                                        border: `1px solid ${isNegativeDeviation ? '#fca5a5' : '#86efac'}`,
                                        color: isNegativeDeviation ? '#b91c1c' : '#15803d'
                                    }}>
                                        {isNegativeDeviation ? 'Estouro: ' : 'Economia: '}{formatBRL(Math.abs(item.deviation))}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.7rem', color: '#64748b', marginBottom: '6px' }}>
                                    <span><strong>Orçado:</strong> {formatBRL(item.budget)}</span>
                                    <span><strong>Realizado:</strong> {formatBRL(item.realized)}</span>
                                    <span><strong>Atingido:</strong> {item.percentage.toFixed(1)}%</span>
                                </div>

                                <div style={{ height: '6px', width: '100%', backgroundColor: '#e2e8f0', borderRadius: '99px', overflow: 'hidden', position: 'relative' }}>
                                    <div style={{ height: '100%', width: `${progressVal}%`, backgroundColor: progressBarColor, borderRadius: '99px', transition: 'width 0.4s ease-out' }} />
                                    {progressVal > 100 && (
                                        <div style={{ position: 'absolute', top: 0, left: '100%', width: '1.5px', height: '100%', backgroundColor: '#000', opacity: 0.2 }} />
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // Renders side-by-side comparative SVG column chart (Orçado vs Realizado)
    const renderMonthlyBreakdownChart = (payload: any) => {
        if (!payload || !payload.values || payload.values.length === 0) return null;

        const titleText = payload.title || payload.titulo || 'Evolução Mensal';
        const viewModeText = payload.viewMode === 'caixa' ? 'Regime de Caixa' : 'Regime de Competência';

        const maxAmount = Math.max(1, ...payload.values.map((i: any) => Math.max(Math.abs(i.budget || 0), Math.abs(i.realized || 0))));
        const totalBudget = payload.values.reduce((sum: number, item: any) => sum + (item.budget || 0), 0);
        const totalRealized = payload.values.reduce((sum: number, item: any) => sum + (item.realized || 0), 0);
        
        const isRevenue = titleText.toUpperCase().includes('FATURAMENTO') || 
                          titleText.toUpperCase().includes('RECEITA') || 
                          titleText.toUpperCase().includes('ENTRADA');
        
        const finalDeviation = isRevenue ? (totalRealized - totalBudget) : (totalBudget - totalRealized);
        const isDeviationPositive = finalDeviation >= 0;

        return (
            <div className="glass-card" style={{ marginTop: '1rem', padding: '1.5rem', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid rgba(15,23,42,0.08)', animation: 'fade-in 0.3s ease-out' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📊 {titleText} ({viewModeText})</span>
                </h3>
                <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '1.25rem' }}>Evolução mensal comparativa de Orçado vs Realizado.</p>

                {/* SVG Side-by-side Bar Chart */}
                <div style={{ height: '180px', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', borderBottom: '1px solid rgba(15, 23, 42, 0.08)', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: '1rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', zIndex: 0, pointerEvents: 'none' }}>
                        <div style={{ borderBottom: '1px dashed rgba(15, 23, 42, 0.03)', width: '100%', height: '0' }} />
                        <div style={{ borderBottom: '1px dashed rgba(15, 23, 42, 0.03)', width: '100%', height: '0' }} />
                        <div style={{ borderBottom: '1px dashed rgba(15, 23, 42, 0.03)', width: '100%', height: '0' }} />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: '100%', zIndex: 1, padding: '0 4px' }}>
                        {payload.values.map((item: any) => {
                            const budgetHeight = (Math.abs(item.budget) / maxAmount) * 100;
                            const realizedHeight = (Math.abs(item.realized) / maxAmount) * 100;

                            return (
                                <div key={item.month} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, maxWidth: '50px' }}>
                                    <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', height: '120px', width: '100%', justifyContent: 'center' }}>
                                        {/* Budget Bar */}
                                        <div 
                                            style={{ width: '12px', height: `${budgetHeight}%`, backgroundColor: '#cbd5e1', borderRadius: '3px 3px 0 0', minHeight: '1px', cursor: 'pointer', position: 'relative' }}
                                            className="dfc-bar"
                                            title={`Orçado: ${formatBRL(item.budget)}`}
                                        >
                                            <div className="dfc-tooltip">Orçado: {formatBRL(item.budget)}</div>
                                        </div>
                                        {/* Realized Bar */}
                                        <div 
                                            style={{ 
                                                width: '12px', 
                                                height: `${realizedHeight}%`, 
                                                backgroundColor: isRevenue 
                                                    ? (item.realized >= item.budget ? '#10b981' : '#f59e0b') 
                                                    : (item.realized <= item.budget ? '#10b981' : '#ef4444'), 
                                                borderRadius: '3px 3px 0 0', 
                                                minHeight: '1px', 
                                                cursor: 'pointer', 
                                                position: 'relative' 
                                            }}
                                            className="dfc-bar"
                                            title={`Realizado: ${formatBRL(item.realized)}`}
                                        >
                                            <div className="dfc-tooltip">Realizado: {formatBRL(item.realized)}</div>
                                        </div>
                                    </div>
                                    <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, marginTop: '6px' }}>
                                        {getMonthName(item.month)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Summary Metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
                    <div style={{ padding: '8px 10px', borderRadius: '8px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700 }}>Total Orçado</span>
                        <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#334155', marginTop: '2px' }}>
                            {formatBRL(totalBudget)}
                        </h4>
                    </div>
                    <div style={{ padding: '8px 10px', borderRadius: '8px', backgroundColor: '#eff6ff', border: '1px solid #dbeafe', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.65rem', color: '#2563eb', fontWeight: 700 }}>Total Realizado</span>
                        <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e3a8a', marginTop: '2px' }}>
                            {formatBRL(totalRealized)}
                        </h4>
                    </div>
                    <div style={{ 
                        padding: '8px 10px', 
                        borderRadius: '8px', 
                        backgroundColor: isDeviationPositive ? '#f0fdf4' : '#fef2f2', 
                        border: `1px solid ${isDeviationPositive ? '#dcfce7' : '#fee2e2'}`, 
                        textAlign: 'center' 
                    }}>
                        <span style={{ fontSize: '0.65rem', color: isDeviationPositive ? '#16a34a' : '#dc2626', fontWeight: 700 }}>
                            {isDeviationPositive ? 'Desvio (Economia)' : 'Desvio (Estouro/Frustração)'}
                        </span>
                        <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: isDeviationPositive ? '#14532d' : '#7f1d1d', marginTop: '2px' }}>
                            {formatBRL(Math.abs(finalDeviation))} ({totalBudget > 0 ? `${((totalRealized / totalBudget) * 100).toFixed(1)}%` : '0%'})
                        </h4>
                    </div>
                </div>

                {/* Table details */}
                <div style={{ border: '1px solid rgba(15, 23, 42, 0.08)', borderRadius: '8px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid rgba(15, 23, 42, 0.08)' }}>
                                <th style={{ padding: '6px 10px', fontWeight: 600, color: '#475569' }}>Mês</th>
                                <th style={{ padding: '6px 10px', fontWeight: 600, color: '#64748b', textAlign: 'right' }}>Orçado</th>
                                <th style={{ padding: '6px 10px', fontWeight: 600, color: '#2563eb', textAlign: 'right' }}>Realizado</th>
                                <th style={{ padding: '6px 10px', fontWeight: 600, color: '#475569', textAlign: 'right' }}>Desvio</th>
                                <th style={{ padding: '6px 10px', fontWeight: 600, color: '#475569', textAlign: 'right' }}>%</th>
                            </tr>
                        </thead>
                        <tbody>
                            {payload.values.map((item: any) => {
                                const realizedVal = item.realized || 0;
                                const budgetVal = item.budget || 0;
                                const itemDev = isRevenue ? (realizedVal - budgetVal) : (budgetVal - realizedVal);
                                const isItemPos = itemDev >= 0;
                                const itemPct = budgetVal > 0 ? (realizedVal / budgetVal) * 100 : 0;
                                return (
                                    <tr key={item.month} style={{ borderBottom: '1px solid rgba(15, 23, 42, 0.04)', backgroundColor: '#ffffff' }}>
                                        <td style={{ padding: '6px 10px', fontWeight: 700, color: '#334155' }}>{getMonthName(item.month)}</td>
                                        <td style={{ padding: '6px 10px', color: '#64748b', textAlign: 'right' }}>{formatBRL(item.budget)}</td>
                                        <td style={{ padding: '6px 10px', color: '#1e293b', textAlign: 'right', fontWeight: 600 }}>{formatBRL(item.realized)}</td>
                                        <td style={{ padding: '6px 10px', color: isItemPos ? '#16a34a' : '#dc2626', textAlign: 'right', fontWeight: 600 }}>
                                            {isItemPos ? '+' : '-'}{formatBRL(Math.abs(itemDev))}
                                        </td>
                                        <td style={{ padding: '6px 10px', color: '#475569', textAlign: 'right' }}>{itemPct.toFixed(0)}%</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    // Renders list of overdue receivables/payables
    const renderOverdueCommitments = (payload: any) => {
        if (!payload || !payload.values) return null;

        const totalPayable = payload.values
            .filter((item: any) => item.type === 'PAYABLE')
            .reduce((sum: number, item: any) => sum + item.amount, 0);
        
        const totalReceivable = payload.values
            .filter((item: any) => item.type === 'RECEIVABLE')
            .reduce((sum: number, item: any) => sum + item.amount, 0);

        return (
            <div className="glass-card" style={{ marginTop: '1rem', padding: '1.5rem', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid rgba(15,23,42,0.08)', animation: 'fade-in 0.3s ease-out' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>⚠️ Relatório de Contas Atrasadas (Vencidas)</span>
                </h3>
                <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '1.25rem' }}>Lista de compromissos vencidos e pendentes de pagamento.</p>

                {/* Resumo Rápido */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
                    <div style={{ padding: '8px 10px', borderRadius: '8px', backgroundColor: '#fef2f2', border: '1px solid #fee2e2', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.65rem', color: '#dc2626', fontWeight: 700 }}>Total a Pagar Atrasado</span>
                        <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#7f1d1d', marginTop: '2px' }}>
                            {formatBRL(totalPayable)}
                        </h4>
                    </div>
                    <div style={{ padding: '8px 10px', borderRadius: '8px', backgroundColor: '#eff6ff', border: '1px solid #dbeafe', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.65rem', color: '#2563eb', fontWeight: 700 }}>Total a Receber Atrasado</span>
                        <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e3a8a', marginTop: '2px' }}>
                            {formatBRL(totalReceivable)}
                        </h4>
                    </div>
                </div>

                {/* Tabela de Contas */}
                <div style={{ border: '1px solid rgba(15, 23, 42, 0.08)', borderRadius: '8px', overflow: 'hidden' }}>
                    <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid rgba(15, 23, 42, 0.08)', position: 'sticky', top: 0, zIndex: 1 }}>
                                    <th style={{ padding: '8px 10px', fontWeight: 600, color: '#475569' }}>Vencimento</th>
                                    <th style={{ padding: '8px 10px', fontWeight: 600, color: '#475569' }}>Tipo</th>
                                    <th style={{ padding: '8px 10px', fontWeight: 600, color: '#475569' }}>Cliente/Fornecedor</th>
                                    <th style={{ padding: '8px 10px', fontWeight: 600, color: '#475569' }}>Categoria/Descrição</th>
                                    <th style={{ padding: '8px 10px', fontWeight: 600, color: '#475569', textAlign: 'right' }}>Valor</th>
                                </tr>
                            </thead>
                            <tbody>
                                {payload.values.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} style={{ padding: '12px', textAlign: 'center', color: '#64748b' }}>Sem contas vencidas no período selecionado. 🎉</td>
                                    </tr>
                                ) : (
                                    payload.values.map((item: any, idx: number) => {
                                        const isPayable = item.type === 'PAYABLE';
                                        return (
                                            <tr key={item.id || idx} style={{ borderBottom: '1px solid rgba(15, 23, 42, 0.04)', backgroundColor: '#ffffff' }}>
                                                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', color: '#64748b' }}>{item.date}</td>
                                                <td style={{ padding: '8px 10px' }}>
                                                    <span style={{ 
                                                        padding: '2px 6px', 
                                                        borderRadius: '4px', 
                                                        fontSize: '0.65rem', 
                                                        fontWeight: 700,
                                                        backgroundColor: isPayable ? '#fef2f2' : '#eff6ff',
                                                        color: isPayable ? '#991b1b' : '#1e40af'
                                                    }}>
                                                        {isPayable ? 'Pagar' : 'Receber'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '8px 10px', fontWeight: 600, color: '#334155' }}>{item.customer}</td>
                                                <td style={{ padding: '8px 10px', color: '#64748b' }}>
                                                    <div style={{ fontWeight: 600, color: '#475569' }}>{item.categoryName}</div>
                                                    <div style={{ fontSize: '0.65rem' }}>{item.description}</div>
                                                </td>
                                                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: isPayable ? '#dc2626' : '#16a34a' }}>
                                                    {formatBRL(item.amount)}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    };

    // Renders short term cash flow projection daily
    const renderShortTermProjection = (payload: any) => {
        if (!payload || !payload.projection || payload.projection.length === 0) return null;

        const startBal = payload.startBalance || 0;
        const list = payload.projection;

        const totalIn = list.reduce((sum: number, item: any) => sum + item.inflow, 0);
        const totalOut = list.reduce((sum: number, item: any) => sum + item.outflow, 0);
        const endBal = list.length > 0 ? list[list.length - 1].endingBalance : startBal;
        const netFlow = totalIn - totalOut;
        const isNetPositive = netFlow >= 0;

        return (
            <div className="glass-card" style={{ marginTop: '1rem', padding: '1.5rem', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid rgba(15,23,42,0.08)', animation: 'fade-in 0.3s ease-out' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🔮 Projeção de Fluxo de Caixa (Próximos {payload.days || 7} Dias)</span>
                </h3>
                <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '1.25rem' }}>Planejamento de liquidez diário com base em contas a pagar e receber previstas.</p>

                {/* Métricas de Curto Prazo */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginBottom: '1.25rem' }}>
                    <div style={{ padding: '6px 8px', borderRadius: '8px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.6rem', color: '#64748b', fontWeight: 700 }}>Saldo Atual</span>
                        <h4 style={{ fontSize: '0.8rem', fontWeight: 800, color: '#334155', marginTop: '2px' }}>{formatBRL(startBal)}</h4>
                    </div>
                    <div style={{ padding: '6px 8px', borderRadius: '8px', backgroundColor: '#f0fdf4', border: '1px solid #dcfce7', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.6rem', color: '#16a34a', fontWeight: 700 }}>Entradas Previstas</span>
                        <h4 style={{ fontSize: '0.8rem', fontWeight: 800, color: '#14532d', marginTop: '2px' }}>{formatBRL(totalIn)}</h4>
                    </div>
                    <div style={{ padding: '6px 8px', borderRadius: '8px', backgroundColor: '#fef2f2', border: '1px solid #fee2e2', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.6rem', color: '#dc2626', fontWeight: 700 }}>Saídas Previstas</span>
                        <h4 style={{ fontSize: '0.8rem', fontWeight: 800, color: '#7f1d1d', marginTop: '2px' }}>{formatBRL(totalOut)}</h4>
                    </div>
                    <div style={{ padding: '6px 8px', borderRadius: '8px', backgroundColor: isNetPositive ? '#f0fdf4' : '#fef2f2', border: `1px solid ${isNetPositive ? '#dcfce7' : '#fee2e2'}`, textAlign: 'center' }}>
                        <span style={{ fontSize: '0.6rem', color: isNetPositive ? '#16a34a' : '#dc2626', fontWeight: 700 }}>Saldo Final</span>
                        <h4 style={{ fontSize: '0.8rem', fontWeight: 800, color: isNetPositive ? '#14532d' : '#7f1d1d', marginTop: '2px' }}>{formatBRL(endBal)}</h4>
                    </div>
                </div>

                {/* SVG Trendline do Saldo Diário */}
                <div style={{ marginBottom: '1.25rem', border: '1px solid rgba(15, 23, 42, 0.05)', padding: '10px', borderRadius: '8px', backgroundColor: '#fafafa' }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b', marginBottom: '8px' }}>Evolução Projetada do Saldo Bancário:</div>
                    <div style={{ height: '80px', width: '100%', position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: '100%', padding: '0 10px' }}>
                            {list.map((item: any, idx: number) => {
                                const maxBalance = Math.max(1, ...list.map((i: any) => Math.max(i.endingBalance, startBal)));
                                const minBalance = Math.min(0, ...list.map((i: any) => i.endingBalance));
                                const balanceRange = maxBalance - minBalance || 1;
                                const heightPercent = ((item.endingBalance - minBalance) / balanceRange) * 80 + 10;
                                
                                return (
                                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                                        <div 
                                            style={{ 
                                                width: '6px', 
                                                height: `${heightPercent}%`, 
                                                backgroundColor: item.endingBalance >= startBal ? '#4f46e5' : '#f59e0b', 
                                                borderRadius: '3px 3px 0 0',
                                                cursor: 'pointer',
                                                position: 'relative'
                                            }}
                                            className="dfc-bar"
                                            title={`Saldo em ${item.date.split('-')[2]}: ${formatBRL(item.endingBalance)}`}
                                        >
                                            <div className="dfc-tooltip">{formatBRL(item.endingBalance)}</div>
                                        </div>
                                        <span style={{ fontSize: '0.6rem', color: '#64748b', marginTop: '4px', fontWeight: 600 }}>
                                            {item.date.split('-')[2]}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Detalhes Diários */}
                <div style={{ border: '1px solid rgba(15, 23, 42, 0.08)', borderRadius: '8px', overflow: 'hidden' }}>
                    <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid rgba(15, 23, 42, 0.08)' }}>
                                    <th style={{ padding: '6px 10px', fontWeight: 600, color: '#475569' }}>Data</th>
                                    <th style={{ padding: '6px 10px', fontWeight: 600, color: '#10b981', textAlign: 'right' }}>Entradas</th>
                                    <th style={{ padding: '6px 10px', fontWeight: 600, color: '#ef4444', textAlign: 'right' }}>Saídas</th>
                                    <th style={{ padding: '6px 10px', fontWeight: 600, color: '#475569', textAlign: 'right' }}>Saldo Projetado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {list.map((item: any, idx: number) => {
                                    const parts = item.date.split('-');
                                    const dateLabel = `${parts[2]}/${parts[1]}`;
                                    return (
                                        <tr key={idx} style={{ borderBottom: '1px solid rgba(15, 23, 42, 0.04)', backgroundColor: '#ffffff' }}>
                                            <td style={{ padding: '6px 10px', fontWeight: 700, color: '#334155' }}>{dateLabel}</td>
                                            <td style={{ padding: '6px 10px', color: '#10b981', textAlign: 'right' }}>{item.inflow > 0 ? formatBRL(item.inflow) : '-'}</td>
                                            <td style={{ padding: '6px 10px', color: '#ef4444', textAlign: 'right' }}>{item.outflow > 0 ? formatBRL(item.outflow) : '-'}</td>
                                            <td style={{ padding: '6px 10px', color: '#1e293b', textAlign: 'right', fontWeight: 700 }}>{formatBRL(item.endingBalance)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div style={{ height: 'calc(100vh - 20px)', width: '100%', display: 'flex', flexDirection: 'column', padding: '1rem 1.5rem', boxSizing: 'border-box' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(15, 23, 42, 0.08)', marginBottom: '1rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.4rem', fontWeight: 800, background: 'linear-gradient(135deg, #1e293b 0%, #4f46e5 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>✨ CFO Virtual de IA</span>
                    </h1>
                    <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '1px' }}>Auditoria, previsões e planos de ação consolidados</p>
                </div>
                
                {/* Unified Tenant Selector with Consolidated Option */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>Filtro:</span>
                    <select
                        value={selectedTenant}
                        onChange={(e) => setSelectedTenant(e.target.value)}
                        style={{
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: '1px solid rgba(15, 23, 42, 0.1)',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            color: '#1e293b',
                            backgroundColor: '#ffffff',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                            outline: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="all">Consolidado (Todas as Empresas)</option>
                        {tenants.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Centered Single-Column Chat Area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '900px', width: '100%', margin: '0 auto', overflow: 'hidden' }} className="glass-card">
                
                {/* Chat Header Status */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid rgba(15, 23, 42, 0.05)', backgroundColor: 'rgba(248, 250, 252, 0.5)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <span style={{ display: 'block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                            <span style={{ position: 'absolute', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981', animation: 'ping 1.5s infinite', opacity: 0.7 }} />
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>CFO Online</span>
                    </div>
                    <button 
                        onClick={() => {
                            if (confirm('Limpar conversa?')) {
                                setMessages([]);
                            }
                        }}
                        style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', padding: '2px 4px' }}
                    >
                        Limpar Chat
                    </button>
                </div>

                {/* Conversation Feed */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', backgroundColor: '#f8fafc' }}>
                    {messages.map((msg) => {
                        const isModel = msg.role === 'model';
                        const visualPayload = isModel ? getVisualPayload(msg.content) : null;

                        return (
                            <div 
                                key={msg.id} 
                                style={{ 
                                    display: 'flex', 
                                    flexDirection: 'column', 
                                    alignSelf: isModel ? 'flex-start' : 'flex-end', 
                                    maxWidth: '85%',
                                    width: isModel && visualPayload ? '100%' : 'auto'
                                }}
                            >
                                {/* Text Bubble */}
                                <div
                                    style={{
                                        padding: '12px 16px',
                                        borderRadius: isModel ? '16px 16px 16px 4px' : '16px 16px 4px 16px',
                                        backgroundColor: isModel ? '#ffffff' : '#3b82f6',
                                        color: isModel ? '#1e293b' : '#ffffff',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                        border: isModel ? '1px solid rgba(15, 23, 42, 0.06)' : 'none',
                                        fontSize: '0.85rem',
                                        lineHeight: 1.5
                                    }}
                                >
                                    {parseMarkdown(msg.content)}
                                </div>
                                
                                {/* Inline Chart rendering */}
                                {isModel && visualPayload && (
                                    <>
                                        {visualPayload.type === 'CASH_FLOW' && renderCashFlowChart(visualPayload)}
                                        {visualPayload.type === 'DEVIATIONS' && renderDeviationsChart(visualPayload)}
                                        {visualPayload.type === 'MONTHLY_BREAKDOWN' && renderMonthlyBreakdownChart(visualPayload)}
                                        {visualPayload.type === 'OVERDUE_COMMITMENTS' && renderOverdueCommitments(visualPayload)}
                                        {visualPayload.type === 'SHORT_TERM_PROJECTION' && renderShortTermProjection(visualPayload)}
                                    </>
                                )}

                                {/* Action plan card rendering below the bubble */}
                                {isModel && msg.suggestedAction && (
                                    <div
                                        style={{
                                            marginTop: '10px',
                                            padding: '12px 14px',
                                            borderRadius: '12px',
                                            backgroundColor: '#eff6ff',
                                            border: '1px dashed #3b82f6',
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.01)'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                            <span style={{ fontSize: '1rem' }}>💡</span>
                                            <strong style={{ fontSize: '0.8rem', color: '#1d4ed8', fontWeight: 700 }}>Plano de Ação Sugerido</strong>
                                        </div>
                                        <p style={{ margin: '4px 0', fontSize: '0.75rem', color: '#475569', lineHeight: 1.4 }}>
                                            <strong>Problema:</strong> {msg.suggestedAction.description}
                                        </p>
                                        <p style={{ margin: '4px 0 8px 0', fontSize: '0.75rem', color: '#475569', lineHeight: 1.4 }}>
                                            <strong>Ação Corretiva:</strong> {msg.suggestedAction.actionText}
                                        </p>
                                        <button
                                            onClick={() => handleCreateAction(msg.suggestedAction, msg.id)}
                                            disabled={actionSavingId === msg.id || actionSavedIds.has(msg.id)}
                                            style={{
                                                width: '100%',
                                                padding: '8px',
                                                borderRadius: '8px',
                                                backgroundColor: actionSavedIds.has(msg.id) ? '#10b981' : '#3b82f6',
                                                color: '#ffffff',
                                                border: 'none',
                                                fontSize: '0.75rem',
                                                fontWeight: 700,
                                                cursor: actionSavedIds.has(msg.id) ? 'default' : 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '6px',
                                                transition: 'background-color 0.2s'
                                            }}
                                            onMouseEnter={e => {
                                                if (!actionSavedIds.has(msg.id)) e.currentTarget.style.backgroundColor = '#2563eb';
                                            }}
                                            onMouseLeave={e => {
                                                if (!actionSavedIds.has(msg.id)) e.currentTarget.style.backgroundColor = '#3b82f6';
                                            }}
                                        >
                                            {actionSavingId === msg.id ? (
                                                <span>Registrando...</span>
                                            ) : actionSavedIds.has(msg.id) ? (
                                                <>
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="20 6 9 17 4 12" />
                                                    </svg>
                                                    <span>Registrado no Painel</span>
                                                </>
                                            ) : (
                                                <span>Aprovar e Salvar Metas</span>
                                            )}
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* Loading Typing Indicator */}
                    {isLoading && (
                        <div style={{ alignSelf: 'flex-start', padding: '12px 16px', borderRadius: '16px 16px 16px 4px', backgroundColor: '#ffffff', border: '1px solid rgba(15, 23, 42, 0.05)', display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#94a3b8', display: 'inline-block', animation: 'typing-pulse 1.2s infinite' }} />
                            <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#94a3b8', display: 'inline-block', animation: 'typing-pulse 1.2s infinite 0.2s' }} />
                            <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#94a3b8', display: 'inline-block', animation: 'typing-pulse 1.2s infinite 0.4s' }} />
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Topics Suggestion chips at bottom of feed */}
                {messages.length <= 1 && !isLoading && (
                    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '6px', backgroundColor: '#f8fafc', borderTop: '1px solid rgba(15, 23, 42, 0.05)' }}>
                        <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, letterSpacing: '0.04em' }}>TÓPICOS RÁPIDOS SUGERIDOS:</span>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                            {quickChips.map((chip, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => sendMessage(chip.text)}
                                    style={{
                                        textAlign: 'left',
                                        padding: '8px 10px',
                                        borderRadius: '8px',
                                        backgroundColor: '#ffffff',
                                        border: '1px solid rgba(15, 23, 42, 0.05)',
                                        fontSize: '0.75rem',
                                        color: '#475569',
                                        cursor: 'pointer',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.01)',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = '#f1f5f9';
                                        e.currentTarget.style.borderColor = 'rgba(15, 23, 42, 0.1)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = '#ffffff';
                                        e.currentTarget.style.borderColor = 'rgba(15, 23, 42, 0.05)';
                                    }}
                                >
                                    {chip.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Chat Footer Input */}
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        sendMessage(input);
                    }}
                    style={{ padding: '1rem', backgroundColor: '#ffffff', borderTop: '1px solid rgba(15, 23, 42, 0.05)', display: 'flex', gap: '8px', alignItems: 'center' }}
                >
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        disabled={isLoading}
                        placeholder="Pergunte ao CFO (ex: 'Auditar desvios de orçamento de junho')..."
                        style={{
                            flex: 1,
                            padding: '10px 14px',
                            borderRadius: '10px',
                            border: '1px solid rgba(15, 23, 42, 0.1)',
                            fontSize: '0.85rem',
                            outline: 'none',
                            transition: 'all 0.2s',
                            color: '#1e293b'
                        }}
                        onFocus={e => {
                            e.currentTarget.style.borderColor = '#4f46e5';
                            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(79, 70, 229, 0.12)';
                        }}
                        onBlur={e => {
                            e.currentTarget.style.borderColor = 'rgba(15, 23, 42, 0.1)';
                            e.currentTarget.style.boxShadow = 'none';
                        }}
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !input.trim()}
                        style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '10px',
                            backgroundColor: '#4f46e5',
                            border: 'none',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            opacity: isLoading || !input.trim() ? 0.5 : 1,
                            transition: 'opacity 0.2s, background-color 0.2s',
                            padding: 0
                        }}
                        onMouseEnter={e => {
                            if (input.trim() && !isLoading) e.currentTarget.style.backgroundColor = '#4338ca';
                        }}
                        onMouseLeave={e => {
                            if (input.trim() && !isLoading) e.currentTarget.style.backgroundColor = '#4f46e5';
                        }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                    </button>
                </form>
            </div>

            {/* CSS styles for animations */}
            <style>{`
                @keyframes typing-pulse {
                    0%, 100% { transform: scale(1); opacity: 0.4; }
                    50% { transform: scale(1.3); opacity: 1; }
                }
                @keyframes fade-in {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                
                .dfc-bar:hover {
                    opacity: 0.85;
                }
                
                .dfc-bar .dfc-tooltip {
                    visibility: hidden;
                    background-color: #0f172a;
                    color: #fff;
                    text-align: center;
                    border-radius: 4px;
                    padding: 3px 6px;
                    position: absolute;
                    z-index: 10;
                    bottom: 105%;
                    left: 50%;
                    transform: translateX(-50%);
                    white-space: nowrap;
                    font-size: 0.65rem;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.15);
                    opacity: 0;
                    transition: opacity 0.1s ease, visibility 0.1s ease;
                    pointer-events: none;
                }
                
                .dfc-bar:hover .dfc-tooltip {
                    visibility: visible;
                    opacity: 1;
                }
                
                .deviation-row:hover {
                    transform: translateY(-1.5px);
                    border-color: rgba(79, 70, 229, 0.2) !important;
                    background-color: #ffffff !important;
                    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.02);
                }
            `}</style>
        </div>
    );
}
