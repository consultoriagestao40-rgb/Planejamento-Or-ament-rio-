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
    const [selectedTenant, setSelectedTenant] = useState<string>('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
    // Action Plan states
    const [actionSavingId, setActionSavingId] = useState<string | null>(null);
    const [actionSavedIds, setActionSavedIds] = useState<Set<string>>(new Set());

    // Visualization Workspace states
    const [visualType, setVisualType] = useState<'NONE' | 'CASH_FLOW' | 'DEVIATIONS'>('NONE');
    const [visualData, setVisualData] = useState<any>(null);

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
                    if (cached && setup.tenants.some((t: any) => t.id === cached)) {
                        setSelectedTenant(cached);
                    } else if (setup.tenants.length > 0) {
                        setSelectedTenant(setup.tenants[0].id);
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
                    content: 'Olá! Sou o seu **CFO Virtual de IA** do BudgetHub.\n\nEstou aqui para auditar os desvios de orçamento, analisar a saúde do seu fluxo de caixa (DFC), rastrear despesas ou ajudar a formular planos de ação práticos.\n\nPara começar, selecione sua empresa e clique em um dos tópicos sugeridos abaixo ou digite sua própria dúvida.'
                }
            ]);
        }
    }, [messages.length]);

    // Parse JSON block in model response
    const parseVisualPayload = (text: string) => {
        try {
            const jsonRegex = /```json\s*(\{[\s\S]*?\})\s*```/;
            const match = jsonRegex.exec(text);
            if (match) {
                const parsed = JSON.parse(match[1]);
                if (parsed.type === 'CASH_FLOW' || parsed.type === 'DEVIATIONS') {
                    setVisualType(parsed.type);
                    setVisualData(parsed);
                }
            }
        } catch (err) {
            console.error('Erro ao analisar JSON embarcado:', err);
        }
    };

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
                // Scan for JSON block to visualize
                parseVisualPayload(data.text);
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
                alert('🚀 Plano de ação criado e registrado com sucesso no painel de metas da categoria!');
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

    return (
        <div style={{ height: 'calc(100vh - 40px)', width: '100%', display: 'flex', flexDirection: 'column', padding: '1.5rem', boxSizing: 'border-box' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(15, 23, 42, 0.08)' }}>
                <div>
                    <h1 style={{ fontSize: '1.6rem', fontWeight: 800, background: 'linear-gradient(135deg, #1e293b 0%, #475569 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>✨ CFO Virtual de IA</span>
                    </h1>
                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '2px' }}>Análise financeira preditiva e auditoria inteligente de caixa</p>
                </div>
                
                {/* Tenant Selection Dropdown */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>Empresa:</span>
                    <select
                        value={selectedTenant}
                        onChange={(e) => setSelectedTenant(e.target.value)}
                        style={{
                            padding: '8px 12px',
                            borderRadius: '8px',
                            border: '1px solid rgba(15, 23, 42, 0.1)',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            color: '#1e293b',
                            backgroundColor: '#ffffff',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                            outline: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        {tenants.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Split Screen Columns */}
            <div style={{ flex: 1, display: 'flex', gap: '1.5rem', overflow: 'hidden' }}>
                
                {/* LEFT COLUMN: Chat Console (40%) */}
                <div className="glass-card" style={{ width: '40%', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: 0 }}>
                    
                    {/* Active Status bar */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(15, 23, 42, 0.06)', backgroundColor: 'rgba(248, 250, 252, 0.5)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                <span style={{ display: 'block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                                <span style={{ position: 'absolute', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981', animation: 'ping 1.5s infinite', opacity: 0.7 }} />
                            </div>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>CFO Online</span>
                        </div>
                        <button 
                            onClick={() => {
                                if (confirm('Limpar histórico da conversa?')) {
                                    setMessages([]);
                                    setVisualType('NONE');
                                    setVisualData(null);
                                }
                            }}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: '#ef4444',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                transition: 'background-color 0.2s',
                                marginLeft: 'auto'
                            }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.08)'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            Limpar Chat
                        </button>
                    </div>

                    {/* Messages Body */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: '#f8fafc' }}>
                        {messages.map((msg) => {
                            const isModel = msg.role === 'model';
                            return (
                                <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignSelf: isModel ? 'flex-start' : 'flex-end', maxWidth: '90%' }}>
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
                                    
                                    {/* Suggested Action Card inside chat */}
                                    {isModel && msg.suggestedAction && (
                                        <div
                                            style={{
                                                marginTop: '8px',
                                                padding: '12px 14px',
                                                borderRadius: '12px',
                                                backgroundColor: '#eff6ff',
                                                border: '1px dashed #3b82f6',
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                                <span style={{ fontSize: '1rem' }}>💡</span>
                                                <strong style={{ fontSize: '0.8rem', color: '#1d4ed8', fontWeight: 700 }}>Plano de Ação Sugerido</strong>
                                            </div>
                                            <p style={{ margin: '4px 0', fontSize: '0.75rem', color: '#475569', lineHeight: 1.4 }}>
                                                <strong>Desvio:</strong> {msg.suggestedAction.description}
                                            </p>
                                            <p style={{ margin: '4px 0 8px 0', fontSize: '0.75rem', color: '#475569', lineHeight: 1.4 }}>
                                                <strong>Ação:</strong> {msg.suggestedAction.actionText}
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
                                                    transition: 'background-color 0.2s, transform 0.1s'
                                                }}
                                                onMouseEnter={e => {
                                                    if (!actionSavedIds.has(msg.id)) e.currentTarget.style.backgroundColor = '#2563eb';
                                                }}
                                                onMouseLeave={e => {
                                                    if (!actionSavedIds.has(msg.id)) e.currentTarget.style.backgroundColor = '#3b82f6';
                                                }}
                                            >
                                                {actionSavingId === msg.id ? (
                                                    <span>Salvando...</span>
                                                ) : actionSavedIds.has(msg.id) ? (
                                                    <>
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                            <polyline points="20 6 9 17 4 12" />
                                                        </svg>
                                                        <span>Registrado</span>
                                                    </>
                                                ) : (
                                                    <span>Registrar Plano de Ação</span>
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {isLoading && (
                            <div style={{ alignSelf: 'flex-start', padding: '12px 16px', borderRadius: '16px 16px 16px 4px', backgroundColor: '#ffffff', border: '1px solid rgba(15, 23, 42, 0.05)', display: 'flex', gap: '4px', alignItems: 'center' }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#94a3b8', display: 'inline-block', animation: 'typing-pulse 1.2s infinite' }} />
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#94a3b8', display: 'inline-block', animation: 'typing-pulse 1.2s infinite 0.2s' }} />
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#94a3b8', display: 'inline-block', animation: 'typing-pulse 1.2s infinite 0.4s' }} />
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Chips at start */}
                    {messages.length <= 1 && !isLoading && (
                        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '6px', backgroundColor: '#f8fafc', borderTop: '1px solid rgba(15, 23, 42, 0.05)' }}>
                            <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, letterSpacing: '0.02em' }}>TÓPICOS SUGERIDOS:</span>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {quickChips.map((chip, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => sendMessage(chip.text)}
                                        style={{
                                            textAlign: 'left',
                                            padding: '8px 10px',
                                            borderRadius: '8px',
                                            backgroundColor: '#ffffff',
                                            border: '1px solid rgba(15, 23, 42, 0.06)',
                                            fontSize: '0.75rem',
                                            color: '#475569',
                                            cursor: 'pointer',
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.01)',
                                            transition: 'background-color 0.2s, border-color 0.2s',
                                            width: '100%',
                                            display: 'block'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = '#f1f5f9';
                                            e.currentTarget.style.borderColor = 'rgba(15, 23, 42, 0.12)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = '#ffffff';
                                            e.currentTarget.style.borderColor = 'rgba(15, 23, 42, 0.06)';
                                        }}
                                    >
                                        {chip.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Input Footer */}
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            sendMessage(input);
                        }}
                        style={{ padding: '1rem', backgroundColor: '#ffffff', borderTop: '1px solid rgba(15, 23, 42, 0.06)', display: 'flex', gap: '8px', alignItems: 'center' }}
                    >
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            disabled={isLoading}
                            placeholder="Ex: Auditar custos com diárias..."
                            style={{
                                flex: 1,
                                padding: '10px 14px',
                                borderRadius: '10px',
                                border: '1px solid rgba(15, 23, 42, 0.1)',
                                fontSize: '0.85rem',
                                outline: 'none',
                                transition: 'border-color 0.2s, box-shadow 0.2s',
                                color: '#1e293b'
                            }}
                            onFocus={e => {
                                e.currentTarget.style.borderColor = '#3b82f6';
                                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.15)';
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
                                backgroundColor: '#3b82f6',
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
                                if (input.trim() && !isLoading) e.currentTarget.style.backgroundColor = '#2563eb';
                            }}
                            onMouseLeave={e => {
                                if (input.trim() && !isLoading) e.currentTarget.style.backgroundColor = '#3b82f6';
                            }}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="22" y1="2" x2="11" y2="13" />
                                <polygon points="22 2 15 22 11 13 2 9 22 2" />
                            </svg>
                        </button>
                    </form>
                </div>

                {/* RIGHT COLUMN: Visual Workspace (60%) */}
                <div className="glass-card" style={{ width: '60%', height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: '1.5rem', backgroundColor: 'rgba(255, 255, 255, 0.75)' }}>
                    
                    {/* Fallback View: Default Welcome Screen */}
                    {visualType === 'NONE' && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', padding: '2rem' }}>
                            <div style={{
                                width: '72px',
                                height: '72px',
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(79, 70, 229, 0.1) 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginBottom: '1.5rem',
                                border: '1px solid rgba(59, 130, 246, 0.15)',
                                color: '#3b82f6',
                                animation: 'floating-glow 3s ease-in-out infinite'
                            }}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                                    <path d="M22 12A10 10 0 0 0 12 2v10z" />
                                </svg>
                            </div>
                            <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.5rem' }}>Workspace do CFO Virtual</h2>
                            <p style={{ fontSize: '0.85rem', color: '#64748b', maxWidth: '440px', lineHeight: 1.5, marginBottom: '2rem' }}>
                                Os gráficos, projeções de caixa e desvios de orçamento auditados pelo CFO serão renderizados de forma interativa e em tempo real neste painel.
                            </p>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', width: '100%', maxWidth: '500px' }}>
                                <div style={{ padding: '1rem', border: '1px solid rgba(15, 23, 42, 0.05)', borderRadius: '12px', backgroundColor: 'rgba(255,255,255,0.4)', textAlign: 'left' }}>
                                    <h4 style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '1rem' }}>📈</span> Fluxo de Caixa (DFC)
                                    </h4>
                                    <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px', lineHeight: 1.4 }}>Diga *"Gere uma análise do fluxo de caixa deste ano"* para visualizar o gráfico de DFC completo.</p>
                                </div>
                                <div style={{ padding: '1rem', border: '1px solid rgba(15, 23, 42, 0.05)', borderRadius: '12px', backgroundColor: 'rgba(255,255,255,0.4)', textAlign: 'left' }}>
                                    <h4 style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '1rem' }}>🎯</span> Desvios de Orçamento
                                    </h4>
                                    <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px', lineHeight: 1.4 }}>Pergunte *"Quais os desvios de junho"* para ver a listagem dinâmica de orçado vs realizado.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Rendering: CASH FLOW Projections */}
                    {visualType === 'CASH_FLOW' && visualData && (
                        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', animation: 'fade-in-right 0.3s ease-out' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <div>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Visualização Consolidada</span>
                                    <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', marginTop: '2px' }}>Fluxo de Caixa Mensal (DFC Base Caixa)</h2>
                                </div>
                                <div style={{ padding: '6px 12px', borderRadius: '20px', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ display: 'block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#065f46' }}>Saldo Atual: {formatBRL(visualData.currentBankBalance)}</span>
                                </div>
                            </div>

                            {/* DFC Monthly Bars Chart */}
                            <div style={{ flex: 1, minHeight: '260px', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', borderBottom: '1px solid rgba(15, 23, 42, 0.08)', paddingBottom: '1.5rem', marginBottom: '1.5rem' }}>
                                
                                {/* Background Grid lines */}
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', zIndex: 0, pointerEvents: 'none' }}>
                                    <div style={{ borderBottom: '1px dashed rgba(15, 23, 42, 0.04)', width: '100%', height: '0' }} />
                                    <div style={{ borderBottom: '1px dashed rgba(15, 23, 42, 0.04)', width: '100%', height: '0' }} />
                                    <div style={{ borderBottom: '1px dashed rgba(15, 23, 42, 0.04)', width: '100%', height: '0' }} />
                                    <div style={{ borderBottom: '1px dashed rgba(15, 23, 42, 0.04)', width: '100%', height: '0' }} />
                                </div>

                                {/* Columns Box */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: '100%', zIndex: 1, padding: '0 8px' }}>
                                    {visualData.monthlyCashFlow?.map((item: any) => {
                                        const maxAmount = Math.max(...visualData.monthlyCashFlow.map((i: any) => Math.max(i.inflow, i.outflow))) || 1;
                                        const inflowHeight = (item.inflow / maxAmount) * 100;
                                        const outflowHeight = (item.outflow / maxAmount) * 100;

                                        return (
                                            <div key={item.month} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, maxWidth: '50px' }}>
                                                
                                                {/* Bar cluster */}
                                                <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', height: '160px', width: '100%' }}>
                                                    {/* Inflow Bar */}
                                                    <div 
                                                        style={{
                                                            flex: 1,
                                                            height: `${inflowHeight}%`,
                                                            backgroundColor: '#10b981',
                                                            borderRadius: '4px 4px 0 0',
                                                            minHeight: '2px',
                                                            cursor: 'pointer',
                                                            transition: 'opacity 0.2s',
                                                            position: 'relative'
                                                        }}
                                                        className="dfc-bar"
                                                        title={`Entradas: ${formatBRL(item.inflow)}`}
                                                    >
                                                        <div className="dfc-tooltip">{formatBRL(item.inflow)}</div>
                                                    </div>

                                                    {/* Outflow Bar */}
                                                    <div 
                                                        style={{
                                                            flex: 1,
                                                            height: `${outflowHeight}%`,
                                                            backgroundColor: '#ef4444',
                                                            borderRadius: '4px 4px 0 0',
                                                            minHeight: '2px',
                                                            cursor: 'pointer',
                                                            transition: 'opacity 0.2s',
                                                            position: 'relative'
                                                        }}
                                                        className="dfc-bar"
                                                        title={`Saídas: ${formatBRL(item.outflow)}`}
                                                    >
                                                        <div className="dfc-tooltip">{formatBRL(item.outflow)}</div>
                                                    </div>
                                                </div>

                                                {/* Label */}
                                                <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, marginTop: '8px' }}>
                                                    {getMonthName(item.month)}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Summary Metrics & DFC Data Details Table */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                                <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: '#f0fdf4', border: '1px solid #dcfce7' }}>
                                    <span style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 700 }}>Total Entradas</span>
                                    <h4 style={{ fontSize: '1rem', fontWeight: 800, color: '#14532d', marginTop: '2px' }}>
                                        {formatBRL(visualData.monthlyCashFlow?.reduce((sum: number, item: any) => sum + item.inflow, 0) || 0)}
                                    </h4>
                                </div>
                                <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: '#fef2f2', border: '1px solid #fee2e2' }}>
                                    <span style={{ fontSize: '0.7rem', color: '#dc2626', fontWeight: 700 }}>Total Saídas</span>
                                    <h4 style={{ fontSize: '1rem', fontWeight: 800, color: '#7f1d1d', marginTop: '2px' }}>
                                        {formatBRL(visualData.monthlyCashFlow?.reduce((sum: number, item: any) => sum + item.outflow, 0) || 0)}
                                    </h4>
                                </div>
                                <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: '#eff6ff', border: '1px solid #dbeafe' }}>
                                    <span style={{ fontSize: '0.7rem', color: '#2563eb', fontWeight: 700 }}>Resultado Net</span>
                                    <h4 style={{ fontSize: '1rem', fontWeight: 800, color: '#1e3a8a', marginTop: '2px' }}>
                                        {formatBRL(
                                            (visualData.monthlyCashFlow?.reduce((sum: number, item: any) => sum + item.inflow, 0) || 0) -
                                            (visualData.monthlyCashFlow?.reduce((sum: number, item: any) => sum + item.outflow, 0) || 0)
                                        )}
                                    </h4>
                                </div>
                            </div>

                            {/* Detailed breakdown list */}
                            <div style={{ flex: 1 }}>
                                <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>Demonstrativo Detalhado (DFC)</h3>
                                <div style={{ border: '1px solid rgba(15, 23, 42, 0.08)', borderRadius: '10px', overflow: 'hidden' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                                        <thead>
                                            <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid rgba(15, 23, 42, 0.08)' }}>
                                                <th style={{ padding: '8px 12px', fontWeight: 600, color: '#475569' }}>Mês</th>
                                                <th style={{ padding: '8px 12px', fontWeight: 600, color: '#10b981', textAlign: 'right' }}>Receitas (+)</th>
                                                <th style={{ padding: '8px 12px', fontWeight: 600, color: '#ef4444', textAlign: 'right' }}>Despesas (-)</th>
                                                <th style={{ padding: '8px 12px', fontWeight: 600, color: '#3b82f6', textAlign: 'right' }}>Líquido (=)</th>
                                                <th style={{ padding: '8px 12px', fontWeight: 600, color: '#64748b', textAlign: 'right' }}>Saldo Caixa</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {visualData.monthlyCashFlow?.map((item: any) => {
                                                const net = item.inflow - item.outflow;
                                                return (
                                                    <tr key={item.month} style={{ borderBottom: '1px solid rgba(15, 23, 42, 0.04)', backgroundColor: '#ffffff' }}>
                                                        <td style={{ padding: '8px 12px', fontWeight: 700, color: '#334155' }}>{getMonthName(item.month)}</td>
                                                        <td style={{ padding: '8px 12px', color: '#10b981', textAlign: 'right', fontWeight: 500 }}>{formatBRL(item.inflow)}</td>
                                                        <td style={{ padding: '8px 12px', color: '#ef4444', textAlign: 'right', fontWeight: 500 }}>{formatBRL(item.outflow)}</td>
                                                        <td style={{ padding: '8px 12px', color: net >= 0 ? '#10b981' : '#ef4444', textAlign: 'right', fontWeight: 700 }}>
                                                            {net >= 0 ? '+' : ''}{formatBRL(net)}
                                                        </td>
                                                        <td style={{ padding: '8px 12px', color: '#475569', textAlign: 'right', fontWeight: 600 }}>{formatBRL(item.projectedBalance)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Rendering: BUDGET DEVIATIONS */}
                    {visualType === 'DEVIATIONS' && visualData && (
                        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', animation: 'fade-in-right 0.3s ease-out' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                                <div>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Auditoria de Competência</span>
                                    <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b', marginTop: '2px' }}>
                                        Desvios de Orçamento: {getMonthName(visualData.month)}/{visualData.year}
                                    </h2>
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                                    Filtrado por desvio (estouros primeiro)
                                </div>
                            </div>

                            {/* Sorted horizontal progress bar rows */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
                                {visualData.deviations?.map((item: any, idx: number) => {
                                    const isRevenue = item.type === 'REVENUE';
                                    
                                    // Deviation logic:
                                    // For expenses: positive deviation = spent less than budgeted (good), negative deviation = spent more (bad)
                                    // For revenues: positive deviation = earned more than budgeted (good), negative deviation = earned less (bad)
                                    const isNegativeDeviation = item.deviation < 0;

                                    const progressVal = Math.min(Math.max(item.percentage, 0), 150); // clamp for display
                                    const progressBarColor = isRevenue
                                        ? (item.percentage >= 100 ? '#10b981' : '#f59e0b')
                                        : (item.percentage > 100 ? '#ef4444' : '#10b981');

                                    return (
                                        <div 
                                            key={item.categoryId || idx} 
                                            onClick={() => sendMessage(`Quero ver os detalhes das transações de ${item.categoryName} em ${getMonthName(visualData.month)} de ${visualData.year}`)}
                                            style={{
                                                padding: '12px 14px',
                                                borderRadius: '12px',
                                                border: '1px solid rgba(15, 23, 42, 0.05)',
                                                backgroundColor: 'rgba(255, 255, 255, 0.7)',
                                                cursor: 'pointer',
                                                transition: 'transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease'
                                            }}
                                            className="deviation-row"
                                            title="Clique para auditar transações detalhadas"
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                <div>
                                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>{item.categoryName}</span>
                                                    <span style={{ fontSize: '0.7rem', color: '#64748b', marginLeft: '8px', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#f1f5f9', fontWeight: 600 }}>
                                                        {isRevenue ? 'Receita' : 'Despesa'}
                                                    </span>
                                                </div>
                                                
                                                {/* Deviation Badge */}
                                                <div style={{
                                                    padding: '4px 8px',
                                                    borderRadius: '6px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 700,
                                                    backgroundColor: isNegativeDeviation ? '#fef2f2' : '#f0fdf4',
                                                    border: `1px solid ${isNegativeDeviation ? '#fca5a5' : '#86efac'}`,
                                                    color: isNegativeDeviation ? '#b91c1c' : '#15803d'
                                                }}>
                                                    {isNegativeDeviation ? 'Estouro: ' : 'Economia: '}{formatBRL(Math.abs(item.deviation))}
                                                </div>
                                            </div>

                                            {/* Values description */}
                                            <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.75rem', color: '#475569', marginBottom: '8px' }}>
                                                <span><strong>Orçado:</strong> {formatBRL(item.budget)}</span>
                                                <span><strong>Realizado:</strong> {formatBRL(item.realized)}</span>
                                                <span><strong>Atingido:</strong> {item.percentage.toFixed(1)}%</span>
                                            </div>

                                            {/* Progress bar wrapper */}
                                            <div style={{ height: '8px', width: '100%', backgroundColor: '#e2e8f0', borderRadius: '99px', overflow: 'hidden', position: 'relative' }}>
                                                <div style={{
                                                    height: '100%',
                                                    width: `${progressVal}%`,
                                                    backgroundColor: progressBarColor,
                                                    borderRadius: '99px',
                                                    transition: 'width 0.5s ease-out'
                                                }} />
                                                
                                                {/* 100% target marker */}
                                                {progressVal > 100 && (
                                                    <div style={{ position: 'absolute', top: 0, left: '100%', width: '2px', height: '100%', backgroundColor: '#000000', opacity: 0.3 }} />
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Tips bar */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', backgroundColor: '#fef3c7', borderRadius: '8px', border: '1px solid #fde68a', fontSize: '0.75rem', color: '#92400e', marginTop: '1.5rem', fontWeight: 500 }}>
                                <span>💡</span>
                                <span><strong>Dica de Auditoria:</strong> Clique em qualquer uma das categorias acima para solicitar ao CFO a listagem detalhada de todos os lançamentos que compõem o valor realizado.</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Custom Interactive Styles */}
            <style>{`
                @keyframes typing-pulse {
                    0%, 100% { transform: scale(1); opacity: 0.4; }
                    50% { transform: scale(1.3); opacity: 1; }
                }
                @keyframes floating-glow {
                    0%, 100% { transform: translateY(0); box-shadow: 0 4px 14px rgba(59, 130, 246, 0.1); }
                    50% { transform: translateY(-5px); box-shadow: 0 8px 24px rgba(59, 130, 246, 0.2); }
                }
                @keyframes fade-in-right {
                    from { opacity: 0; transform: translateX(15px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                
                .dfc-bar:hover {
                    opacity: 0.85;
                }
                
                /* Simple CSS tooltip trigger */
                .dfc-bar .dfc-tooltip {
                    visibility: hidden;
                    background-color: #1e293b;
                    color: #fff;
                    text-align: center;
                    border-radius: 6px;
                    padding: 4px 8px;
                    position: absolute;
                    z-index: 10;
                    bottom: 105%;
                    left: 50%;
                    transform: translateX(-50%);
                    white-space: nowrap;
                    font-size: 0.7rem;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    opacity: 0;
                    transition: opacity 0.15s ease, visibility 0.15s ease;
                }
                
                .dfc-bar:hover .dfc-tooltip {
                    visibility: visible;
                    opacity: 1;
                }
                
                .deviation-row:hover {
                    transform: translateY(-2px);
                    border-color: rgba(59, 130, 246, 0.25);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
                    background-color: rgba(255, 255, 255, 0.9) !important;
                }
            `}</style>
        </div>
    );
}
