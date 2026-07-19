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

    // Chat History and Sidebar States
    const [sessions, setSessions] = useState<any[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [isChatOpen, setIsChatOpen] = useState(false); // Controls the AI Chat Advisor drawer!
    const [expiredTenants, setExpiredTenants] = useState<string[]>([]);

    // Dashboard Data
    const [dashboardData, setDashboardData] = useState<any>(null);
    const [loadingDashboard, setLoadingDashboard] = useState<boolean>(true);

    // Growth Simulator State (Card 4)
    const [simMetaVendas, setSimMetaVendas] = useState(500000);
    const [simPMR, setSimPMR] = useState(90);
    const [simCusto, setSimCusto] = useState(180000);
 
    // Chart Hover States
    const [hoveredPoint, setHoveredPoint] = useState<any | null>(null);
    const [hoveredSimPoint, setHoveredSimPoint] = useState<any | null>(null);
 
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Load tenants and chat sessions on mount
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

                // Verificar conexões expiradas
                const compRes = await fetch('/api/companies');
                const compData = await compRes.json();
                if (compData.success && compData.companies) {
                    const expired = compData.companies
                        .filter((t: any) => !t.tokenExpiresAt || new Date(t.tokenExpiresAt) < new Date())
                        .map((t: any) => t.name);
                    setExpiredTenants(expired);
                }
            } catch (err) {
                console.error('Erro ao carregar tenants:', err);
            }
        };
        loadSetup();
        loadSessions();
    }, []);

    // Fetch Dashboard Data whenever tenant changes
    useEffect(() => {
        const fetchDashboard = async () => {
            if (!selectedTenant) return;
            setLoadingDashboard(true);
            try {
                const res = await fetch(`/api/dfc?tenantId=${selectedTenant}&year=2026`);
                const json = await res.json();
                if (json.success) {
                    setDashboardData(json);
                }
            } catch (err) {
                console.error('Erro ao carregar dados do dashboard:', err);
            } finally {
                setLoadingDashboard(false);
            }
        };
        fetchDashboard();
    }, [selectedTenant]);

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
    }, [messages, isLoading, isChatOpen]);

    // Load sessions
    const loadSessions = async () => {
        try {
            const res = await fetch('/api/chat/sessions');
            const data = await res.json();
            if (data.success && data.sessions) {
                setSessions(data.sessions);
            }
        } catch (err) {
            console.error('Erro ao carregar sessões de chat:', err);
        }
    };

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

    // Iniciar um novo chat limpo
    const createNewChat = () => {
        setActiveSessionId(null);
        setMessages([
            {
                id: 'greeting',
                role: 'model',
                content: 'Olá! Sou o seu **CFO Virtual de IA** do BudgetHub.\n\nEstou pronto para analisar seu fluxo de caixa (DFC), auditar desvios de orçamento (orçado vs realizado competência) e identificar gargalos financeiros de forma individual ou consolidada.\n\nSelecione o filtro de empresa no topo e clique em um dos tópicos rápidos abaixo ou faça uma pergunta direta.'
            }
        ]);
    };

    // Carregar detalhes de uma conversa selecionada
    const loadSessionDetails = async (sessionId: string) => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/chat/sessions/${sessionId}`);
            const data = await res.json();
            if (data.success && data.session) {
                setActiveSessionId(data.session.id);
                setSelectedTenant(data.session.tenantId);
                
                if (data.session.messages && data.session.messages.length > 0) {
                    const formattedMsgs = data.session.messages.map((m: any) => ({
                        id: m.id,
                        role: m.role as 'user' | 'model',
                        content: m.content,
                        suggestedAction: m.suggestedAction
                    }));
                    setMessages(formattedMsgs);
                } else {
                    setMessages([]);
                }
            }
        } catch (err) {
            console.error('Erro ao carregar detalhes da sessão:', err);
        } finally {
            setIsLoading(false);
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
        setIsChatOpen(true); // Open AI Chat Drawer when a message is sent

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [...messages.filter(m => m.id !== 'greeting'), userMsg].map(m => ({ role: m.role, content: m.content })),
                    tenantId: selectedTenant,
                    sessionId: activeSessionId
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

                if (!activeSessionId && data.sessionId) {
                    setActiveSessionId(data.sessionId);
                }
                loadSessions();
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
                return <strong key={index} style={{ fontWeight: 700, color: '#f8fafc' }}>{part.slice(2, -2)}</strong>;
            }
            if (part.startsWith('`') && part.endsWith('`')) {
                return <code key={index} style={{ fontFamily: 'monospace', backgroundColor: '#1f2937', padding: '2px 4px', borderRadius: '4px', fontSize: '0.8rem', color: '#f43f5e' }}>{part.slice(1, -1)}</code>;
            }
            if (part.startsWith('[') && part.includes('](')) {
                const label = part.slice(1, part.indexOf(']'));
                const url = part.slice(part.indexOf('](') + 2, -1);
                return <a key={index} href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8', textDecoration: 'underline' }}>{label}</a>;
            }
            return part;
        });
    };

    // Markdown block parser
    const parseMarkdown = (text: string) => {
        if (!text) return null;
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
                            <li key={idx} style={{ marginBottom: '4px', fontSize: '0.85rem', color: '#94a3b8' }}>
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
                    <div key={`table-wrapper-${key}`} style={{ overflowX: 'auto', margin: '12px 0', borderRadius: '8px', border: '1px solid #1f2937', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#1f2937', borderBottom: '1px solid #374151' }}>
                                    {tableHeaders.map((h, idx) => (
                                        <th key={idx} style={{ padding: '8px 12px', fontWeight: 600, color: '#94a3b8' }}>{h.trim()}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {tableRows.map((row, rIdx) => (
                                    <tr key={rIdx} style={{ borderBottom: rIdx === tableRows.length - 1 ? 'none' : '1px solid #1f2937', backgroundColor: rIdx % 2 === 0 ? '#111827' : '#1f2937' }}>
                                        {row.map((cell, cIdx) => (
                                            <td key={cIdx} style={{ padding: '8px 12px', color: '#94a3b8' }}>
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
                elements.push(<h4 key={i} style={{ margin: '12px 0 6px 0', fontSize: '0.9rem', fontWeight: 700, color: '#f8fafc' }}>{parseInlineStyles(line.substring(4))}</h4>);
                continue;
            }
            if (line.startsWith('## ')) {
                elements.push(<h3 key={i} style={{ margin: '16px 0 8px 0', fontSize: '1rem', fontWeight: 700, color: '#f8fafc', borderBottom: '1px solid #1f2937', paddingBottom: '4px' }}>{parseInlineStyles(line.substring(3))}</h3>);
                continue;
            }
            if (line.startsWith('# ')) {
                elements.push(<h2 key={i} style={{ margin: '18px 0 8px 0', fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc' }}>{parseInlineStyles(line.substring(2))}</h2>);
                continue;
            }

            if (line === '') {
                continue;
            }

            elements.push(<p key={i} style={{ margin: '6px 0', fontSize: '0.85rem', lineHeight: 1.5, color: '#94a3b8' }}>{parseInlineStyles(line)}</p>);
        }

        flushList('final');
        flushTable('final');

        return elements;
    };

    // Calculate Dashboard Variables dynamically
    const cashConsolidated = dashboardData?.currentBankBalance || 0;
    const totalOutflows = dashboardData?.monthlyData.reduce((sum: number, m: any) => sum + m.pagamentosOperacionais, 0) || 0;
    const dailyBurnVal = totalOutflows / 365;
    const runwayDays = dailyBurnVal > 0 ? Math.round(cashConsolidated / dailyBurnVal) : 0;

    const totalCAR = dashboardData?.monthlyData.flatMap((m: any) => m.details).filter((d: any) => !d.isRealized && d.isRevenue).reduce((sum: number, d: any) => sum + d.amount, 0) || 0;
    const totalCAP = dashboardData?.monthlyData.flatMap((m: any) => m.details).filter((d: any) => !d.isRealized && !d.isRevenue).reduce((sum: number, d: any) => sum + d.amount, 0) || 0;
    const workingCapitalNeed = Math.max(0, totalCAP - totalCAR);

    // Main Chart Projeção Variables
    const projectionPoints = dashboardData?.dailyProjection.slice(0, 90) || [];
    const balances = projectionPoints.map((p: any) => p.balance);
    const maxBal = Math.max(...balances, 500000);
    const minBal = Math.min(...balances, 0);
    const range = maxBal - minBal || 1;
    const getY = (val: number) => 180 - ((val - minBal) / range) * 130;
    const getX = (idx: number) => (idx / (projectionPoints.length - 1)) * 550;

    let pathD = '';
    projectionPoints.forEach((p: any, idx: number) => {
        if (idx === 0) pathD += `M ${getX(idx)} ${getY(p.balance)}`;
        else pathD += ` L ${getX(idx)} ${getY(p.balance)}`;
    });

    // Aging List (Card 1)
    const pendingInflows = dashboardData?.monthlyData
        .flatMap((m: any) => m.details)
        .filter((d: any) => !d.isRealized && d.isRevenue) || [];

    let totalReceivables = 0;
    let aging = { overdue: 0, t1_15: 0, t16_30: 0, t31_60: 0, t61_plus: 0 };
    pendingInflows.forEach((d: any) => {
        const amt = d.amount;
        totalReceivables += amt;
        const dueDate = new Date(d.originalDate || d.date);
        const today = new Date();
        const diffTime = dueDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            aging.overdue += amt;
        } else if (diffDays <= 15) {
            aging.t1_15 += amt;
        } else if (diffDays <= 30) {
            aging.t16_30 += amt;
        } else if (diffDays <= 60) {
            aging.t31_60 += amt;
        } else {
            aging.t61_plus += amt;
        }
    });

    // Gestão de Passivos (Card 3)
    const passivos = dashboardData?.monthlyData
        .flatMap((m: any) => m.details)
        .filter((d: any) => !d.isRealized && !d.isRevenue && (d.category.startsWith('06.3') || d.category.startsWith('6.3'))) || [];

    const quickChips = [
        { label: '🔎 Desvios de orçamento (Junho)', text: 'Auditar principais desvios de orçamento de junho de 2026' },
        { label: '💸 Onde estamos perdendo dinheiro?', text: 'Identifique quais contas estão com maiores estouros de orçamento até o momento' },
        { label: '📊 Saúde do fluxo de caixa', text: 'Analise a saúde do fluxo de caixa (DFC) para este ano de 2026' },
        { label: '🔮 Previsão de caixa e runway', text: 'Faça uma projeção de saldo de caixa para os próximos meses com base nas médias' }
    ];

    return (
        <div style={{ backgroundColor: '#0b0f19', minHeight: '100vh', width: '100%', color: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif', padding: '1.5rem', boxSizing: 'border-box', overflowX: 'hidden', position: 'relative' }}>
            
            {/* Warning Banner for Expired Connections */}
            {expiredTenants.length > 0 && (
                <div style={{
                    backgroundColor: '#7f1d1d',
                    border: '1px solid #b91c1c',
                    borderRadius: '12px',
                    padding: '1rem 1.25rem',
                    marginBottom: '1.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.85rem',
                    color: '#fca5a5',
                    fontWeight: 600,
                    boxShadow: '0 2px 4px rgba(220, 38, 38, 0.05)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                        <span>
                            Conexão expirada com o Conta Azul para: <strong>{expiredTenants.join(', ')}</strong>. Os dados de fluxo de caixa estão desatualizados e os títulos pagos/recebidos recentemente não foram processados.
                        </span>
                    </div>
                    <a href="/sync" style={{
                        backgroundColor: '#dc2626',
                        color: '#ffffff',
                        padding: '0.5rem 1rem',
                        borderRadius: '8px',
                        textDecoration: 'none',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        transition: 'background-color 0.2s',
                        whiteSpace: 'nowrap'
                    }}>
                        Reconectar Conta Azul
                    </a>
                </div>
            )}
            
            {/* 1. TOP HEADER & FILTERS */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1f2937', paddingBottom: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>🛡️ PAINEL DE FLUXO DE CAIXA PREDITIVO</span>
                    </h1>
                    <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '2px' }}>
                        {selectedTenant === 'all' 
                            ? 'CFO view for your company group: Spot Facilities, JVS Tratamentos, Clean Tech'
                            : `Visualização individual: ${tenants.find(t => t.id === selectedTenant)?.name || ''}`}
                    </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Período:</span>
                        <select style={{ backgroundColor: '#111827', color: '#f8fafc', border: '1px solid #1f2937', padding: '4px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, outline: 'none' }}>
                            <option>90 Dias</option>
                            <option>180 Dias</option>
                        </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Grupo:</span>
                        <select 
                            value={selectedTenant} 
                            onChange={(e) => setSelectedTenant(e.target.value)} 
                            style={{ backgroundColor: '#111827', color: '#f8fafc', border: '1px solid #1f2937', padding: '4px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, outline: 'none', cursor: 'pointer' }}
                        >
                            <option value="all">Consol.</option>
                            {tenants.map(t => (
                                <option key={t.id} value={t.id}>{t.name.split(' ')[0]}</option>
                            ))}
                        </select>
                    </div>

                    <button 
                        onClick={() => setIsChatOpen(true)}
                        style={{ backgroundColor: '#4f46e5', color: '#ffffff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', transition: 'background-color 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#4338ca'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#4f46e5'}
                    >
                        💬 Consultar IA
                    </button>
                </div>
            </div>

            {loadingDashboard ? (
                <div style={{ height: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', color: '#94a3b8' }}>
                    <div style={{ width: '32px', height: '32px', border: '3px solid #1f2937', borderTopColor: '#38bdf8', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Carregando dados preditivos do caixa...</span>
                </div>
            ) : (
                <>
                    {/* 2. TOP KPI CARDS */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                        {/* POSIÇÃO DE CAIXA CONSOLIDADA */}
                        <div style={{ backgroundColor: '#111827', borderRadius: '12px', padding: '1.25rem', border: '1px solid #1f2937', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Posição de Caixa Consolidada</span>
                                <span style={{ fontSize: '1rem' }}>💼</span>
                            </div>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10b981', margin: 0 }}>{formatBRL(cashConsolidated)}</h2>
                            <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Saldo em conta consolidado do grupo</span>
                        </div>

                        {/* PISTA DE CAIXA (RUNWAY) */}
                        <div style={{ backgroundColor: '#111827', borderRadius: '12px', padding: '1.25rem', border: '1px solid #1f2937', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pista de Caixa (Runway)</span>
                                <span style={{ fontSize: '1rem' }}>⏳</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#38bdf8', margin: 0 }}>{runwayDays}</h2>
                                <span style={{ fontSize: '0.8rem', color: '#38bdf8', fontWeight: 700 }}>Dias</span>
                            </div>
                            <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Autonomia estimada do caixa atual</span>
                        </div>

                        {/* QUEIMA DE CAIXA DIÁRIA */}
                        <div style={{ backgroundColor: '#111827', borderRadius: '12px', padding: '1.25rem', border: '1px solid #1f2937', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Queima de Caixa Diária</span>
                                <span style={{ fontSize: '1rem' }}>🔥</span>
                            </div>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ef4444', margin: 0 }}>{formatBRL(dailyBurnVal)}</h2>
                            <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Média de saídas diárias operacionais</span>
                        </div>

                        {/* NECESSIDADE DE CAPITAL DE GIRO */}
                        <div style={{ backgroundColor: '#111827', borderRadius: '12px', padding: '1.25rem', border: '1px solid #1f2937', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Necessidade de Capital de Giro</span>
                                <span style={{ fontSize: '1rem' }}>🛡️</span>
                            </div>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f59e0b', margin: 0 }}>{formatBRL(workingCapitalNeed)}</h2>
                            <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Capital livre necessário para cobrir compromissos</span>
                        </div>
                    </div>

                    {/* 3. MAIN PROJECTION LINE CHART & VISÃO MULTIEMPRESAS */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 70%) 30%', gap: '1.5rem', marginBottom: '1.5rem' }}>
                        {/* PROJEÇÃO DE SALDO BANCÁRIO */}
                        <div style={{ backgroundColor: '#111827', borderRadius: '12px', padding: '1.5rem', border: '1px solid #1f2937', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Projeção de Saldo Bancário (90 Dias)</span>
                                <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>Linha de Tendência de Liquidez</span>
                            </div>

                            <div style={{ height: '220px', width: '100%', position: 'relative' }}>
                                {projectionPoints.length === 0 ? (
                                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>
                                        Carregando projeção diária...
                                    </div>
                                ) : (
                                    <svg width="100%" height="220" viewBox="0 0 550 220" style={{ overflow: 'visible' }}>
                                        {/* Highlight if balance drops below safety limit */}
                                        {(() => {
                                            const safetyLimit = 250000;
                                            const dipPoints = projectionPoints.map((p: any, idx: number) => ({ idx, val: p.balance })).filter((p: any) => p.val < safetyLimit);
                                            if (dipPoints.length === 0) return null;
                                            const startX = getX(dipPoints[0].idx);
                                            const endX = getX(dipPoints[dipPoints.length - 1].idx);
                                            return (
                                                <g>
                                                    <rect x={startX} y="10" width={Math.max(15, endX - startX)} height="170" fill="rgba(239, 68, 68, 0.08)" rx="4" />
                                                    <line x1={(startX + endX)/2} y1="10" x2={(startX + endX)/2} y2="180" stroke="#ef4444" strokeWidth="1" strokeDasharray="2,2" />
                                                    <text x={(startX + endX)/2} y="196" textAnchor="middle" fill="#ef4444" fontSize="7" fontWeight="800">13º Salário / Encargos</text>
                                                </g>
                                            );
                                        })()}

                                        {/* Horizontal Safety limit line */}
                                        <line x1="0" y1={getY(250000)} x2="550" y2={getY(250000)} stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4,4" opacity="0.8" />
                                        <text x="540" y={getY(250000) - 6} textAnchor="end" fill="#ef4444" fontSize="8" fontWeight="800" opacity="0.9">
                                            CAIXA MÍNIMO DE SEGURANÇA R$ 250.000
                                        </text>

                                        {/* Area below curve */}
                                        {(() => {
                                            let areaD = `M 0 180`;
                                            projectionPoints.forEach((p: any, idx: number) => {
                                                areaD += ` L ${getX(idx)} ${getY(p.balance)}`;
                                            });
                                            areaD += ` L 550 180 Z`;
                                            return <path d={areaD} fill="rgba(56, 189, 248, 0.05)" />;
                                        })()}

                                        {/* Trend line */}
                                        <path d={pathD} fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />

                                        {/* Start / End dots and values */}
                                        <circle cx="0" cy={getY(balances[0])} r="4" fill="#38bdf8" stroke="#0b0f19" strokeWidth="1.5" />
                                        <text x="8" y={getY(balances[0]) + 12} fill="#94a3b8" fontSize="8" fontWeight="700">{formatBRL(balances[0])}</text>

                                        <circle cx="550" cy={getY(balances[balances.length - 1])} r="4" fill="#38bdf8" stroke="#0b0f19" strokeWidth="1.5" />
                                        <text x="542" y={getY(balances[balances.length - 1]) - 10} textAnchor="end" fill="#38bdf8" fontSize="9" fontWeight="800">{formatBRL(balances[balances.length - 1])}</text>

                                        {/* Hover detectors */}
                                        {projectionPoints.map((p: any, idx: number) => {
                                            const x = getX(idx);
                                            const sliceWidth = 550 / (projectionPoints.length - 1 || 1);
                                            return (
                                                <rect
                                                    key={idx}
                                                    x={x - sliceWidth / 2}
                                                    y={10}
                                                    width={sliceWidth}
                                                    height={170}
                                                    fill={hoveredPoint?.date === p.date ? 'rgba(56, 189, 248, 0.03)' : 'transparent'}
                                                    style={{ cursor: 'crosshair' }}
                                                    onMouseEnter={() => setHoveredPoint({
                                                        x: x,
                                                        y: getY(p.balance),
                                                        date: p.date,
                                                        balance: p.balance
                                                    })}
                                                    onMouseLeave={() => setHoveredPoint(null)}
                                                />
                                            );
                                        })}

                                        {/* Hover line and tooltip */}
                                        {hoveredPoint && (
                                            <g pointerEvents="none">
                                                <line x1={hoveredPoint.x} y1="10" x2={hoveredPoint.x} y2="180" stroke="#38bdf8" strokeWidth="1.2" strokeDasharray="3,3" />
                                                <circle cx={hoveredPoint.x} cy={hoveredPoint.y} r="5.5" fill="#38bdf8" stroke="#ffffff" strokeWidth="2" />
                                                {(() => {
                                                    const tooltipW = 125;
                                                    const tooltipH = 38;
                                                    const tx = hoveredPoint.x > 400 ? hoveredPoint.x - tooltipW - 12 : hoveredPoint.x + 12;
                                                    const ty = Math.max(15, Math.min(130, hoveredPoint.y - 45));
                                                    return (
                                                        <g>
                                                            <rect x={tx} y={ty} width={tooltipW} height={tooltipH} fill="#1f2937" stroke="#38bdf8" strokeWidth="1.5" rx="6" />
                                                            <text x={tx + 8} y={ty + 13} fill="#94a3b8" fontSize="7.5" fontWeight="700">
                                                                {new Date(hoveredPoint.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                            </text>
                                                            <text x={tx + 8} y={ty + 26} fill="#f8fafc" fontSize="8.5" fontWeight="800">
                                                                {formatBRL(hoveredPoint.balance)}
                                                            </text>
                                                        </g>
                                                    );
                                                })()}
                                            </g>
                                        )}
                                    </svg>
                                )}
                            </div>
                        </div>

                        {/* VISÃO MULTIEMPRESAS (SALDO ATUAL) */}
                        <div style={{ backgroundColor: '#111827', borderRadius: '12px', padding: '1.5rem', border: '1px solid #1f2937', display: 'flex', flexDirection: 'column', gap: '1rem', boxSizing: 'border-box' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Visão Multiempresas</span>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem', marginTop: '0.5rem' }}>
                                {(() => {
                                    const accounts = dashboardData?.bankAccounts || [];
                                    const totalCash = accounts.reduce((sum: number, acc: any) => sum + acc.balance, 0) || 1;
                                    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
                                    return accounts.map((acc: any, idx: number) => {
                                        const pct = (acc.balance / totalCash) * 100;
                                        return (
                                            <div key={acc.id} style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                                                    <span style={{ fontWeight: 700, color: '#e2e8f0' }}>{acc.name}</span>
                                                    <span style={{ fontWeight: 800, color: acc.balance >= 0 ? '#10b981' : '#ef4444' }}>{formatBRL(acc.balance)}</span>
                                                </div>
                                                <div style={{ height: '6px', width: '100%', backgroundColor: '#1f2937', borderRadius: '3px', overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', width: `${Math.max(1, Math.min(100, pct))}%`, backgroundColor: colors[idx % colors.length], borderRadius: '3px' }} />
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                                {(!dashboardData?.bankAccounts || dashboardData?.bankAccounts.length === 0) && (
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center', padding: '2rem 0' }}>
                                        Sem contas bancárias carregadas.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 4. BOTTOM CARDS ROW */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
                        {/* 1. AGING LIST RECEBÍVEIS */}
                        <div style={{ backgroundColor: '#111827', borderRadius: '12px', padding: '1.25rem', border: '1px solid #1f2937', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>1. Aging List Recebíveis</span>
                                <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700 }}>{formatBRL(totalReceivables)} Totais</span>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', height: '100px', padding: '0 4px', borderBottom: '1px solid #1f2937', paddingBottom: '8px' }}>
                                {/* A Vencer */}
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <div style={{ width: '100%', height: `${Math.max(2, (aging.t1_15 + aging.t16_30 + aging.t31_60 + aging.t61_plus) / (totalReceivables || 1) * 80)}px`, backgroundColor: '#10b981', borderRadius: '2px' }} />
                                    <span style={{ fontSize: '0.55rem', color: '#94a3b8', marginTop: '4px', textAlign: 'center', whiteSpace: 'nowrap' }}>A Vencer</span>
                                </div>
                                {/* 1-15 */}
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <div style={{ width: '100%', height: `${Math.max(2, aging.t1_15 / (totalReceivables || 1) * 80)}px`, backgroundColor: '#3b82f6', borderRadius: '2px' }} />
                                    <span style={{ fontSize: '0.55rem', color: '#94a3b8', marginTop: '4px', textAlign: 'center' }}>1-15</span>
                                </div>
                                {/* 16-30 */}
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <div style={{ width: '100%', height: `${Math.max(2, aging.t16_30 / (totalReceivables || 1) * 80)}px`, backgroundColor: '#f59e0b', borderRadius: '2px' }} />
                                    <span style={{ fontSize: '0.55rem', color: '#94a3b8', marginTop: '4px', textAlign: 'center' }}>16-30</span>
                                </div>
                                {/* 31-60 */}
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <div style={{ width: '100%', height: `${Math.max(2, aging.t31_60 / (totalReceivables || 1) * 80)}px`, backgroundColor: '#ec4899', borderRadius: '2px' }} />
                                    <span style={{ fontSize: '0.55rem', color: '#94a3b8', marginTop: '4px', textAlign: 'center' }}>31-60</span>
                                </div>
                                {/* 61+ */}
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <div style={{ width: '100%', height: `${Math.max(2, aging.overdue / (totalReceivables || 1) * 80)}px`, backgroundColor: '#ef4444', borderRadius: '2px' }} />
                                    <span style={{ fontSize: '0.55rem', color: '#ef4444', marginTop: '4px', textAlign: 'center', fontWeight: 700 }}>61+ Dias</span>
                                </div>
                            </div>
                        </div>

                        {/* 2. CONTAS A PAGAR */}
                        <div style={{ backgroundColor: '#111827', borderRadius: '12px', padding: '1.25rem', border: '1px solid #1f2937', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>2. Contas a Pagar</span>
                                <span style={{ fontSize: '0.65rem', color: '#ef4444', fontWeight: 700 }}>⚠️ ALERT</span>
                            </div>
                            <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600 }}>PMP (Prazo Médio Pgto) vs PMR (Prazo Médio Rec)</span>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem' }}>
                                        <span style={{ color: '#94a3b8' }}>PMP (Média pagamento)</span>
                                        <span style={{ fontWeight: 700, color: '#38bdf8' }}>42 Dias</span>
                                    </div>
                                    <div style={{ height: '6px', width: '100%', backgroundColor: '#1f2937', borderRadius: '3px' }}>
                                        <div style={{ height: '100%', width: '42%', backgroundColor: '#38bdf8', borderRadius: '3px' }} />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem' }}>
                                        <span style={{ color: '#94a3b8' }}>PMR (Média recebimento)</span>
                                        <span style={{ fontWeight: 700, color: '#f59e0b' }}>52 Dias</span>
                                    </div>
                                    <div style={{ height: '6px', width: '100%', backgroundColor: '#1f2937', borderRadius: '3px' }}>
                                        <div style={{ height: '100%', width: '52%', backgroundColor: '#f59e0b', borderRadius: '3px' }} />
                                    </div>
                                </div>
                            </div>
                            <div style={{ marginTop: 'auto', backgroundColor: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: '6px', padding: '6px', textAlign: 'center', fontSize: '0.65rem', color: '#fca5a5', fontWeight: 700 }}>
                                Ciclo Financeiro Gap: 10 Dias
                            </div>
                        </div>

                        {/* 3. GESTÃO DE PASSIVOS/ACORDOS */}
                        <div style={{ backgroundColor: '#111827', borderRadius: '12px', padding: '1.25rem', border: '1px solid #1f2937', display: 'flex', flexDirection: 'column', gap: '0.75rem', boxSizing: 'border-box' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>3. Gestão de Passivos/Acordos</span>
                                <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700 }}>{formatBRL(passivos.reduce((sum: number, d: any) => sum + d.amount, 0))} Totais</span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '100px', paddingRight: '2px' }}>
                                {passivos.slice(0, 3).map((p: any, idx: number) => (
                                    <div key={p.id || idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', borderBottom: '1px solid #1f2937', paddingBottom: '4px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                            <span style={{ fontWeight: 700, color: '#e2e8f0', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px', overflow: 'hidden' }}>{p.description || 'Acordo Bancário'}</span>
                                            <span style={{ color: '#94a3b8', fontSize: '0.6rem' }}>{new Date(p.date).toLocaleDateString('pt-BR')}</span>
                                        </div>
                                        <span style={{ fontWeight: 800, color: '#ef4444' }}>{formatBRL(p.amount)}</span>
                                    </div>
                                ))}
                                {passivos.length === 0 && (
                                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', textAlign: 'center', padding: '1.5rem 0' }}>
                                        Sem acordos ou passivos bancários previstos.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 4. SIMULADOR DE CRESCIMENTO */}
                        <div style={{ backgroundColor: '#111827', borderRadius: '12px', padding: '1.25rem', border: '1px solid #1f2937', display: 'flex', flexDirection: 'column', gap: '0.5rem', boxSizing: 'border-box' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>4. Simulador de Crescimento</span>
                            
                            {/* Inputs */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span style={{ fontSize: '0.55rem', color: '#94a3b8' }}>Meta Vendas</span>
                                    <input 
                                        type="number" 
                                        value={simMetaVendas} 
                                        onChange={(e) => setSimMetaVendas(Number(e.target.value))}
                                        style={{ width: '100%', background: '#1f2937', border: '1px solid #374151', color: '#f8fafc', fontSize: '0.65rem', padding: '2px 4px', borderRadius: '4px', outline: 'none' }} 
                                    />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span style={{ fontSize: '0.55rem', color: '#94a3b8' }}>PMR (Dias)</span>
                                    <input 
                                        type="number" 
                                        value={simPMR} 
                                        onChange={(e) => setSimPMR(Number(e.target.value))}
                                        style={{ width: '100%', background: '#1f2937', border: '1px solid #374151', color: '#f8fafc', fontSize: '0.65rem', padding: '2px 4px', borderRadius: '4px', outline: 'none' }} 
                                    />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span style={{ fontSize: '0.55rem', color: '#94a3b8' }}>Custo (Fixo)</span>
                                    <input 
                                        type="number" 
                                        value={simCusto} 
                                        onChange={(e) => setSimCusto(Number(e.target.value))}
                                        style={{ width: '100%', background: '#1f2937', border: '1px solid #374151', color: '#f8fafc', fontSize: '0.65rem', padding: '2px 4px', borderRadius: '4px', outline: 'none' }} 
                                    />
                                </div>
                            </div>

                            {/* Result SVG Curve */}
                            <div style={{ height: '45px', width: '100%', border: '1px solid #1f2937', borderRadius: '6px', backgroundColor: '#111827', position: 'relative', marginTop: '4px', overflow: 'hidden' }}>
                                <svg width="100%" height="45" viewBox="0 0 150 45">
                                    {(() => {
                                        const days = [0, 30, 60, 90, 120, 150];
                                        const maxVal = (simMetaVendas * (simPMR / 365)) + simCusto;
                                        const getXSim = (idx: number) => (idx / (days.length - 1)) * 150;
                                        const getYSim = (val: number) => 40 - (val / (maxVal || 1)) * 30;
                                        
                                        let simPath = 'M 0 40';
                                        days.forEach((d, idx) => {
                                            const val = (simMetaVendas * (d / 360) * (simPMR / 365)) + (simCusto * (idx / 5));
                                            simPath += ` L ${getXSim(idx)} ${getYSim(val)}`;
                                        });
                                        return (
                                            <g>
                                                <path d={simPath} fill="none" stroke="#10b981" strokeWidth="1.5" />
                                                <text x="5" y="12" fill="#94a3b8" fontSize="6">Nec. Caixa:</text>
                                                <text x="145" y="12" textAnchor="end" fill="#10b981" fontSize="7" fontWeight="800">
                                                    {formatBRL(maxVal)}
                                                </text>
 
                                                {/* Hover detectors for simulator */}
                                                {days.map((d, idx) => {
                                                    const x = getXSim(idx);
                                                    const val = (simMetaVendas * (d / 360) * (simPMR / 365)) + (simCusto * (idx / 5));
                                                    const sliceWidth = 150 / (days.length - 1 || 1);
                                                    return (
                                                        <rect
                                                            key={idx}
                                                            x={x - sliceWidth / 2}
                                                            y={0}
                                                            width={sliceWidth}
                                                            height={45}
                                                            fill="transparent"
                                                            style={{ cursor: 'crosshair' }}
                                                            onMouseEnter={() => setHoveredSimPoint({
                                                                x: x,
                                                                y: getYSim(val),
                                                                day: d,
                                                                val: val
                                                            })}
                                                            onMouseLeave={() => setHoveredSimPoint(null)}
                                                        />
                                                    );
                                                })}
 
                                                {/* Simulation Hover line and tooltip */}
                                                {hoveredSimPoint && (
                                                    <g pointerEvents="none">
                                                        <line x1={hoveredSimPoint.x} y1="0" x2={hoveredSimPoint.x} y2="40" stroke="#10b981" strokeWidth="0.5" strokeDasharray="2,2" />
                                                        <circle cx={hoveredSimPoint.x} cy={hoveredSimPoint.y} r="3" fill="#10b981" stroke="#ffffff" strokeWidth="1" />
                                                        {(() => {
                                                            const tooltipW = 75;
                                                            const tooltipH = 22;
                                                            const tx = hoveredSimPoint.x > 100 ? hoveredSimPoint.x - tooltipW - 4 : hoveredSimPoint.x + 4;
                                                            const ty = Math.max(2, Math.min(20, hoveredSimPoint.y - 11));
                                                            return (
                                                                <g>
                                                                    <rect x={tx} y={ty} width={tooltipW} height={tooltipH} fill="#1f2937" stroke="#10b981" strokeWidth="1" rx="4" />
                                                                    <text x={tx + 4} y={ty + 8} fill="#94a3b8" fontSize="5" fontWeight="700">Dia {hoveredSimPoint.day}</text>
                                                                    <text x={tx + 4} y={ty + 17} fill="#f8fafc" fontSize="5.5" fontWeight="800">{formatBRL(hoveredSimPoint.val)}</text>
                                                                </g>
                                                            );
                                                        })()}
                                                    </g>
                                                )}
                                            </g>
                                        );
                                    })()}
                                </svg>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* 5. FLOATING AI CHAT DRAWER */}
            {isChatOpen && (
                <div 
                    style={{
                        position: 'fixed',
                        top: 0,
                        right: 0,
                        width: '420px',
                        height: '100vh',
                        backgroundColor: '#111827',
                        borderLeft: '1px solid #1f2937',
                        boxShadow: '-10px 0 30px rgba(0,0,0,0.5)',
                        zIndex: 1000,
                        display: 'flex',
                        flexDirection: 'column',
                        animation: 'slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                    }}
                >
                    {/* Drawer Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', borderBottom: '1px solid #1f2937', backgroundColor: '#0b0f19' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                <span style={{ display: 'block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                                <span style={{ position: 'absolute', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981', animation: 'ping 1.5s infinite', opacity: 0.7 }} />
                            </div>
                            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#f8fafc' }}>CFO Virtual AI Advisor</span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <button 
                                onClick={createNewChat}
                                style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
                            >
                                Limpar
                            </button>
                            <button 
                                onClick={() => setIsChatOpen(false)}
                                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                &times;
                            </button>
                        </div>
                    </div>

                    {/* Chat Sessions list inside Drawer */}
                    {sessions.length > 0 && (
                        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', padding: '8px 12px', borderBottom: '1px solid #1f2937', backgroundColor: '#111827', whiteSpace: 'nowrap' }}>
                            {sessions.map(s => (
                                <button
                                    key={s.id}
                                    onClick={() => loadSessionDetails(s.id)}
                                    style={{
                                        border: '1px solid #1f2937',
                                        background: s.id === activeSessionId ? 'rgba(79, 70, 229, 0.1)' : '#0b0f19',
                                        color: s.id === activeSessionId ? '#38bdf8' : '#94a3b8',
                                        fontSize: '0.7rem',
                                        padding: '4px 8px',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontWeight: s.id === activeSessionId ? 700 : 500
                                    }}
                                >
                                    💬 {s.title}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Conversation Feed */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', backgroundColor: '#0b0f19' }}>
                        {messages.map((msg) => {
                            const isModel = msg.role === 'model';
                            return (
                                <div 
                                    key={msg.id} 
                                    style={{ 
                                        display: 'flex', 
                                        flexDirection: 'column', 
                                        alignSelf: isModel ? 'flex-start' : 'flex-end', 
                                        maxWidth: '90%'
                                    }}
                                >
                                    {/* Text Bubble */}
                                    <div
                                        style={{
                                            padding: '10px 14px',
                                            borderRadius: isModel ? '16px 16px 16px 4px' : '16px 16px 4px 16px',
                                            backgroundColor: isModel ? '#111827' : '#2563eb',
                                            color: isModel ? '#94a3b8' : '#ffffff',
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                                            border: isModel ? '1px solid #1f2937' : 'none',
                                            fontSize: '0.8rem',
                                            lineHeight: 1.45
                                        }}
                                    >
                                        {parseMarkdown(msg.content)}
                                    </div>
                                    
                                    {/* Action plan card rendering below the bubble */}
                                    {isModel && msg.suggestedAction && (
                                        <div
                                            style={{
                                                marginTop: '10px',
                                                padding: '12px 14px',
                                                borderRadius: '12px',
                                                backgroundColor: 'rgba(79, 70, 229, 0.08)',
                                                border: '1px dashed #4f46e5',
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.01)'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                                <span style={{ fontSize: '1rem' }}>💡</span>
                                                <strong style={{ fontSize: '0.8rem', color: '#38bdf8', fontWeight: 700 }}>Plano de Ação Sugerido</strong>
                                            </div>
                                            <p style={{ margin: '4px 0', fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.4 }}>
                                                <strong>Problema:</strong> {msg.suggestedAction.description}
                                            </p>
                                            <p style={{ margin: '4px 0 8px 0', fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.4 }}>
                                                <strong>Ação Corretiva:</strong> {msg.suggestedAction.actionText}
                                            </p>
                                            <button
                                                onClick={() => handleCreateAction(msg.suggestedAction, msg.id)}
                                                disabled={actionSavingId === msg.id || actionSavedIds.has(msg.id)}
                                                style={{
                                                    width: '100%',
                                                    padding: '8px',
                                                    borderRadius: '8px',
                                                    backgroundColor: actionSavedIds.has(msg.id) ? '#10b981' : '#4f46e5',
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
                            <div style={{ alignSelf: 'flex-start', padding: '12px 16px', borderRadius: '16px 16px 16px 4px', backgroundColor: '#111827', border: '1px solid #1f2937', display: 'flex', gap: '4px', alignItems: 'center' }}>
                                <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#94a3b8', display: 'inline-block', animation: 'typing-pulse 1.2s infinite' }} />
                                <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#94a3b8', display: 'inline-block', animation: 'typing-pulse 1.2s infinite 0.2s' }} />
                                <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#94a3b8', display: 'inline-block', animation: 'typing-pulse 1.2s infinite 0.4s' }} />
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Topics Suggestion chips at bottom of feed */}
                    {messages.length <= 1 && !isLoading && (
                        <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px', backgroundColor: '#111827', borderTop: '1px solid #1f2937' }}>
                            <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em' }}>TÓPICOS RÁPIDOS SUGERIDOS:</span>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                                {quickChips.map((chip, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => sendMessage(chip.text)}
                                        style={{
                                            textAlign: 'left',
                                            padding: '6px 8px',
                                            borderRadius: '6px',
                                            backgroundColor: '#0b0f19',
                                            border: '1px solid #1f2937',
                                            fontSize: '0.72rem',
                                            color: '#94a3b8',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = '#1f2937';
                                            e.currentTarget.style.color = '#f8fafc';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = '#0b0f19';
                                            e.currentTarget.style.color = '#94a3b8';
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
                        style={{ padding: '1rem', backgroundColor: '#111827', borderTop: '1px solid #1f2937', display: 'flex', gap: '8px', alignItems: 'center' }}
                    >
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            disabled={isLoading}
                            placeholder="Pergunte ao CFO virtual de IA..."
                            style={{
                                flex: 1,
                                padding: '10px 14px',
                                borderRadius: '10px',
                                border: '1px solid #1f2937',
                                fontSize: '0.82rem',
                                outline: 'none',
                                transition: 'all 0.2s',
                                color: '#f8fafc',
                                backgroundColor: '#0b0f19'
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
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="22" y1="2" x2="11" y2="13" />
                                <polygon points="22 2 15 22 11 13 2 9 22 2" />
                            </svg>
                        </button>
                    </form>
                </div>
            )}

            {/* FLOATING ACTION AI CHAT BUBBLE BUTTON */}
            {!isChatOpen && (
                <button
                    onClick={() => setIsChatOpen(true)}
                    style={{
                        position: 'fixed',
                        bottom: '24px',
                        right: '24px',
                        width: '56px',
                        height: '56px',
                        borderRadius: '50%',
                        backgroundColor: '#4f46e5',
                        border: 'none',
                        boxShadow: '0 8px 24px rgba(79, 70, 229, 0.4)',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        zIndex: 999,
                        fontSize: '1.5rem',
                        transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.transform = 'scale(1.1) translateY(-3px)';
                        e.currentTarget.style.boxShadow = '0 12px 28px rgba(79, 70, 229, 0.5)';
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.boxShadow = '0 8px 24px rgba(79, 70, 229, 0.4)';
                    }}
                    title="Conversar com CFO de IA"
                >
                    💬
                </button>
            )}

            {/* CSS styles for animations */}
            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes typing-pulse {
                    0%, 100% { transform: scale(1); opacity: 0.4; }
                    50% { transform: scale(1.3); opacity: 1; }
                }
                @keyframes fade-in {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes slide-in {
                    from { transform: translateX(100%); }
                    to { transform: translateX(0); }
                }
                @keyframes ping {
                    0% { transform: scale(1); opacity: 1; }
                    70%, 100% { transform: scale(2.5); opacity: 0; }
                }
            `}</style>
        </div>
    );
}
