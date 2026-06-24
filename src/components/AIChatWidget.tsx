'use client';

import React, { useState, useEffect, useRef } from 'react';

interface Message {
    id: string;
    role: 'user' | 'model';
    content: string;
    suggestedAction?: any;
}

export default function AIChatWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [actionSavingId, setActionSavingId] = useState<string | null>(null);
    const [actionSavedIds, setActionSavedIds] = useState<Set<string>>(new Set());

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll on new messages
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
                    content: 'Olá! Sou o seu **CFO Virtual de IA**. Como posso te ajudar na gestão financeira hoje?\n\nPosso auditar os desvios de orçamento, analisar a saúde do seu fluxo de caixa (DFC), rastrear despesas ou ajudar a formular planos de ação.'
                }
            ]);
        }
    }, []);

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
            // Get selected company/tenant ID from localStorage matching dashboard select
            const selectedTenantId = localStorage.getItem('selectedTenantId') || '';

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
                    tenantId: selectedTenantId
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
            const selectedTenantId = localStorage.getItem('selectedTenantId') || '';
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    actionType: 'CREATE_ACTION',
                    tenantId: selectedTenantId,
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
                alert('🚀 Plano de ação criado com sucesso no painel de metas da categoria!');
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
        { label: '🔎 Auditar desvios de junho', text: 'Auditar principais desvios de orçamento de junho de 2026' },
        { label: '💸 Onde estamos perdendo dinheiro?', text: 'Identifique quais contas estão com maiores estouros de orçamento até o momento' },
        { label: '📊 Analisar saúde do fluxo de caixa', text: 'Analise a saúde do fluxo de caixa (DFC) para este ano de 2026' },
        { label: '🔮 Previsão de caixa e runway', text: 'Faça uma projeção de saldo de caixa para os próximos meses com base nas médias' }
    ];

    // Markdown simple parser
    const parseMarkdown = (text: string) => {
        if (!text) return null;
        const lines = text.split('\n');
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
                            <li key={idx} style={{ marginBottom: '4px', fontSize: '0.85rem', color: '#1e293b' }}>
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

            elements.push(<p key={i} style={{ margin: '6px 0', fontSize: '0.85rem', lineHeight: 1.45, color: '#334155' }}>{parseInlineStyles(line)}</p>);
        }

        flushList('final');
        flushTable('final');

        return elements;
    };

    const parseInlineStyles = (text: string): React.ReactNode[] => {
        const regex = /(\*\*.*?\*\*|`.*?`|\[.*?\]\(.*?\))/g;
        const matches = text.split(regex);

        return matches.map((part, index) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={index} style={{ fontWeight: 700, color: '#0f172a' }}>{part.slice(2, -2)}</strong>;
            }
            if (part.startsWith('`') && part.endsWith('`')) {
                return <code key={index} style={{ fontFamily: 'monospace', backgroundColor: '#f1f5f9', padding: '2px 4px', borderRadius: '4px', fontSize: '0.8rem', color: '#e11d48' }}>{part.slice(1, -1)}</code>;
            }
            if (part.startsWith('[') && part.includes('](')) {
                const label = part.slice(1, part.indexOf(']'));
                const url = part.slice(part.indexOf('](') + 2, -1);
                return <a key={index} href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'underline' }}>{label}</a>;
            }
            return part;
        });
    };

    return (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            {/* Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(79, 70, 229, 0.4), 0 2px 4px rgba(0,0,0,0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    transform: isOpen ? 'rotate(90deg)' : 'none',
                    color: '#ffffff',
                    padding: 0
                }}
                title="Conversar com o CFO Virtual"
            >
                {isOpen ? (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2a10 10 0 0 1 7.54 16.59L19.5 22l-3.41-1.41A10 10 0 1 1 12 2z" />
                        <path d="M12 8v8M8 12h8" style={{ opacity: 0.7 }} />
                    </svg>
                )}
            </button>

            {/* Chat Panel */}
            {isOpen && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: '72px',
                        right: 0,
                        width: '380px',
                        height: '540px',
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        backdropFilter: 'blur(16px)',
                        borderRadius: '16px',
                        border: '1px solid rgba(226, 232, 240, 0.8)',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        animation: 'fadeIn 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                >
                    {/* Header */}
                    <div
                        style={{
                            padding: '12px 16px',
                            background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ position: 'relative' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#22c55e' }} />
                                <div style={{ position: 'absolute', top: 0, left: 0, width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#22c55e', animate: 'ping 1.5s infinite', opacity: 0.7 }} />
                            </div>
                            <div>
                                <h4 style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem' }}>CFO Virtual</h4>
                                <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>Inteligência Financeira</span>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            style={{ background: 'none', border: 'none', color: '#ffffff', opacity: 0.8, cursor: 'pointer', padding: '4px' }}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="6 9 12 15 18 9" />
                            </svg>
                        </button>
                    </div>

                    {/* Messages Body */}
                    <div
                        style={{
                            flex: 1,
                            overflowY: 'auto',
                            padding: '16px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px',
                            backgroundColor: '#f8fafc'
                        }}
                    >
                        {messages.map((msg) => {
                            const isModel = msg.role === 'model';
                            return (
                                <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignSelf: isModel ? 'flex-start' : 'flex-end', maxWidth: '85%' }}>
                                    <div
                                        style={{
                                            padding: '10px 14px',
                                            borderRadius: isModel ? '12px 12px 12px 2px' : '12px 12px 2px 12px',
                                            backgroundColor: isModel ? '#ffffff' : '#4f46e5',
                                            color: isModel ? '#1e293b' : '#ffffff',
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                            border: isModel ? '1px solid #e2e8f0' : 'none'
                                        }}
                                    >
                                        {parseMarkdown(msg.content)}
                                    </div>
                                    
                                    {/* Action suggestion card */}
                                    {isModel && msg.suggestedAction && (
                                        <div
                                            style={{
                                                marginTop: '8px',
                                                padding: '12px',
                                                borderRadius: '8px',
                                                backgroundColor: '#eff6ff',
                                                border: '1px dashed #3b82f6',
                                                boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                                <span style={{ fontSize: '1rem' }}>💡</span>
                                                <strong style={{ fontSize: '0.8rem', color: '#1d4ed8' }}>Plano de Ação Sugerido</strong>
                                            </div>
                                            <p style={{ margin: '4px 0', fontSize: '0.75rem', color: '#475569' }}>
                                                <strong>Desvio:</strong> {msg.suggestedAction.description}
                                            </p>
                                            <p style={{ margin: '4px 0', fontSize: '0.75rem', color: '#475569' }}>
                                                <strong>Ação:</strong> {msg.suggestedAction.actionText}
                                            </p>
                                            <button
                                                onClick={() => handleCreateAction(msg.suggestedAction, msg.id)}
                                                disabled={actionSavingId === msg.id || actionSavedIds.has(msg.id)}
                                                style={{
                                                    marginTop: '8px',
                                                    width: '100%',
                                                    padding: '6px',
                                                    borderRadius: '6px',
                                                    backgroundColor: actionSavedIds.has(msg.id) ? '#10b981' : '#3b82f6',
                                                    color: '#ffffff',
                                                    border: 'none',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    cursor: actionSavedIds.has(msg.id) ? 'default' : 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '4px'
                                                }}
                                            >
                                                {actionSavingId === msg.id ? (
                                                    <span>Salvando...</span>
                                                ) : actionSavedIds.has(msg.id) ? (
                                                    <>
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                            <polyline points="20 6 9 17 4 12" />
                                                        </svg>
                                                        <span>Plano Salvo</span>
                                                    </>
                                                ) : (
                                                    <span>Aprovar e Registrar Plano</span>
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Typing / Loading indicator */}
                        {isLoading && (
                            <div style={{ alignSelf: 'flex-start', padding: '10px 14px', borderRadius: '12px 12px 12px 2px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', display: 'flex', gap: '4px', alignItems: 'center' }}>
                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#94a3b8', animation: 'pulse 1.2s infinite' }} />
                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#94a3b8', animation: 'pulse 1.2s infinite 0.2s' }} />
                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#94a3b8', animation: 'pulse 1.2s infinite 0.4s' }} />
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Quick suggestion chips (only shown when conversation starts) */}
                    {messages.length === 1 && !isLoading && (
                        <div
                            style={{
                                padding: '8px 12px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px',
                                backgroundColor: '#f8fafc',
                                borderTop: '1px solid #f1f5f9'
                            }}
                        >
                            <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>TÓPICOS SUGERIDOS:</span>
                            {quickChips.map((chip, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => sendMessage(chip.text)}
                                    style={{
                                        textAlign: 'left',
                                        padding: '6px 10px',
                                        borderRadius: '6px',
                                        backgroundColor: '#ffffff',
                                        border: '1px solid #e2e8f0',
                                        fontSize: '0.75rem',
                                        color: '#475569',
                                        cursor: 'pointer',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                                        transition: 'background-color 0.2s',
                                        display: 'block',
                                        width: '100%'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
                                >
                                    {chip.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Input Footer */}
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            sendMessage(input);
                        }}
                        style={{
                            padding: '12px',
                            backgroundColor: '#ffffff',
                            borderTop: '1px solid #e2e8f0',
                            display: 'flex',
                            gap: '8px',
                            alignItems: 'center'
                        }}
                    >
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            disabled={isLoading}
                            placeholder="Pergunte ao seu CFO..."
                            style={{
                                flex: 1,
                                padding: '8px 12px',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.85rem',
                                outline: 'none',
                                transition: 'border-color 0.2s'
                            }}
                        />
                        <button
                            type="submit"
                            disabled={isLoading || !input.trim()}
                            style={{
                                width: '34px',
                                height: '34px',
                                borderRadius: '8px',
                                backgroundColor: '#4f46e5',
                                border: 'none',
                                color: '#ffffff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                opacity: isLoading || !input.trim() ? 0.5 : 1,
                                transition: 'opacity 0.2s',
                                padding: 0
                            }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="22" y1="2" x2="11" y2="13" />
                                <polygon points="22 2 15 22 11 13 2 9 22 2" />
                            </svg>
                        </button>
                    </form>
                </div>
            )}

            {/* Custom Animations injected via tag */}
            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes pulse {
                    0%, 100% { transform: scale(1); opacity: 0.6; }
                    50% { transform: scale(1.2); opacity: 1; }
                }
                @keyframes ping {
                    75%, 100% { transform: scale(2); opacity: 0; }
                }
            `}</style>
        </div>
    );
}
