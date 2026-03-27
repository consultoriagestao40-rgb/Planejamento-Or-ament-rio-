'use client';
// BudgetEntryGrid - Tela exclusiva de lançamento de orçamento por CC
// v67.22 - VISIBILIDADE UNIVERSAL POR CÓDIGO (Fim do Sumiço de Dados)

import React, { useState, useMemo, useEffect } from 'react';
import { MONTHS } from '@/lib/mock-data';

const CODE_NAMES: Record<string, string> = {
    '03.1': '03.1 Salarios e Remuneração', '03.2': '03.2 Encargos Sociais', '03.3': '03.3 Beneficios',
    '03.4': '03.4 Diárias', '03.5': '03.5 SSMA', '03.6': '03.6 Materiais',
    '03.7': '03.7 Equipamentos', '03.8': '03.8 Comunicação/Sistema/Licenças', '03.9': '03.9 Custo com Veiculo',
    '04.1': '04.1 Salarios e Remuneração', '04.2': '04.2 Encargos Sociais', '04.3': '04.3 Beneficios',
    '04.4': '04.4 SSMA', '04.5': '04.5 Viagens', '04.6': '04.6 Custo com Veículos',
    '04.7': '04.7 Cartão Corporativo', '04.8': '04.8 Serviços Terceirizados',
    '05.1': '05.1 Salario e Remuneração', '05.2': '05.2 Encargos Sociais', '05.3': '05.3 Beneficios',
    '05.4': '05.4 SSMA', '05.5': '05.5 Viagens', '05.6': '05.6 Despesa com Socios',
    '05.7': '05.7 Serviços Contratados', '05.8': '05.8 Despesa Comercial/Marketing',
    '05.9': '05.9 Despesa com Estrutura', '05.10': '05.10 Despesa Copa e Cozinha',
    '05.11': '05.11 Despesa com Veículos', '05.12': '05.12 Despesa de Informatica',
    '05.13': '05.13 Taxas e Despesas Legais',
    '06.1': '06.1 Entradas Financeiras', '06.2': '06.2 Saidas Financeiras',
    '06.3': '06.3 Financiamento', '06.4': '06.4 Juros/Multas', '06.5': '06.5 Passivo Trabalhista',
    '06.6': '06.6 Depreciação', '06.7': '06.7 Cartão de Credito', '06.8': '06.8 PDD',
};

interface BudgetEntryGridProps {
    costCenterId: string;
    year: number;
    taxRate?: number;
}

interface CategoryNode {
    id: string;
    name: string;
    parentId: string | null;
    children: CategoryNode[];
    level: number;
    type?: string;
    code?: string;
    isSynthetic?: boolean;
    tenantId?: string;
}

export default function BudgetEntryGrid({ costCenterId, year, taxRate = 0 }: BudgetEntryGridProps) {
    const [budgetValues, setBudgetValues] = useState<Record<string, { amount: number; radarAmount: number | null; isLocked: boolean; observation?: string | null }>>({});
    const [realizedValues, setRealizedValues] = useState<Record<string, number>>({});
    const [isCCLocked, setIsCCLocked] = useState(false);
    const [categories, setCategories] = useState<any[]>([]);
    const [tenantId, setTenantId] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [userRole, setUserRole] = useState<'MASTER' | 'GESTOR' | null>(null);

    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    const [budgetModal, setBudgetModal] = useState<{ categoryId: string; fullNodeId: string; categoryName: string; startMonth: number } | null>(null);
    const [modalValues, setModalValues] = useState<string[]>(new Array(12).fill(''));
    const [lockedMonths, setLockedMonths] = useState<boolean[]>(new Array(12).fill(false));
    const [activeMonth, setActiveMonth] = useState<number>(0);
    const [isSavingBudget, setIsSavingBudget] = useState(false);
    const [modalObservation, setModalObservation] = useState<string>('');

    const [approvalStatus, setApprovalStatus] = useState<string>('PENDING');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fmt = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const evaluateFormula = (formula: string): number => {
        if (!formula.startsWith('=')) {
            const clean = formula.replace(/\\.(?=\\d{3}(,|$))/g, '').replace(',', '.');
            const val = parseFloat(clean);
            return isNaN(val) ? 0 : val;
        }
        try {
            const expression = formula.substring(1).replace(/,/g, '.').replace(/[^-+*/().0-9]/g, '');
            const result = new Function(\`return \${expression}\`)();
            return typeof result === 'number' && isFinite(result) ? result : 0;
        } catch { return 0; }
    };

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                const [setupRes, budgetRes, syncRes, authRes] = await Promise.all([
                    fetch('/api/setup?t=' + Date.now()),
                    fetch(\`/api/budgets?costCenterId=\${costCenterId}&year=\${year}&t=\` + Date.now()),
                    fetch(\`/api/sync?costCenterId=\${costCenterId}&year=\${year}&t=\` + Date.now()),
                    fetch('/api/auth/me')
                ]);

                const [setupData, budgetData, syncData, authData] = await Promise.all([
                    setupRes.json(), budgetRes.json(), syncRes.json(), authRes.json()
                ]);

                if (setupData.success) {
                    setCategories(setupData.categories || []);
                    const foundCC = (setupData.fullCostCenters || []).find((cc: any) => cc.id === costCenterId);
                    if (foundCC?.tenantId) setTenantId(foundCC.tenantId);

                    // Map for code-based visibility
                    const idToCodeMap = new Map<string, string>();
                    setupData.categories.forEach((c: any) => {
                        const codeMatch = c.name.match(/^([\\d.]+)/);
                        if (codeMatch) idToCodeMap.set(c.id, codeMatch[1].split('.').map((s: string) => parseInt(s, 10).toString()).join('.'));
                    });

                    if (budgetData.success) {
                        setIsCCLocked(budgetData.isCCLocked || false);
                        setApprovalStatus(budgetData.status || 'PENDING');
                        const values: Record<string, any> = {};
                        (budgetData.data || []).forEach((item: any) => {
                            const cCode = idToCodeMap.get(item.categoryId);
                            if (cCode) {
                                values[\`\${cCode}-\${item.month - 1}\`] = {
                                    amount: item.amount || 0,
                                    radarAmount: item.radarAmount ?? null,
                                    isLocked: item.isLocked || false,
                                    observation: item.observation || null
                                };
                            }
                        });
                        setBudgetValues(values);
                    }
                }

                if (syncData.success && syncData.realizedValues) setRealizedValues(syncData.realizedValues);
                if (authData.success) setUserRole(authData.user.role);
            } catch (err) { console.error('Load error:', err); } finally { setLoading(false); }
        };
        loadData();
    }, [costCenterId, year]);

    const treeRoots = useMemo(() => {
        const map = new Map<string, CategoryNode>();
        const codeMap = new Map<string, CategoryNode>();
        const nameMap = new Map<string, CategoryNode>();

        categories.forEach((cat: any) => {
            const codeMatch = cat.name.match(/^([\\d.]+)/);
            const rawCode = codeMatch ? codeMatch[1] : '';
            if (rawCode.startsWith('2.3') || rawCode.startsWith('2.4')) return;

            let effectiveName = cat.name;
            let effectiveCode = rawCode;

            const uKey = effectiveCode || effectiveName;
            if (nameMap.has(uKey)) {
                const existing = nameMap.get(uKey)!;
                if (!existing.id.includes(cat.id)) existing.id += ',' + cat.id;
                map.set(cat.id, existing);
                return;
            }

            const node: CategoryNode = { ...cat, name: effectiveName, code: effectiveCode, children: [], level: 0 };
            map.set(cat.id, node);
            nameMap.set(uKey, node);
            if (effectiveCode) codeMap.set(effectiveCode, node);
        });

        // Synthetic groups
        const synthGroups = [
            { code: '01.1', name: '01.1 - Receita de Serviços' },
            { code: '01.2', name: '01.2 - Receitas de Vendas' },
            { code: '02.1', name: '02.1 - Tributos' },
            ...Object.keys(CODE_NAMES).map(c => ({ code: c, name: CODE_NAMES[c] }))
        ];
        synthGroups.forEach(s => {
            if (!codeMap.has(s.code)) {
                const n: CategoryNode = { id: \`synth-\${s.code}\`, name: s.name, code: s.code, parentId: null, children: [], level: 0, isSynthetic: true };
                map.set(n.id, n);
                codeMap.set(s.code, n);
            }
        });

        map.forEach(node => {
            if (node.isSynthetic) return;
            const code = node.code || '';
            if (code.startsWith('01.1.')) codeMap.get('01.1')?.children.push(node);
            else if (code.startsWith('01.2.')) codeMap.get('01.2')?.children.push(node);
            else if (code.startsWith('2.1')) codeMap.get('02.1')?.children.push(node);
            else if (code.includes('.')) {
                let pCode = code.substring(0, code.lastIndexOf('.'));
                codeMap.get(pCode)?.children.push(node);
            }
        });

        const potentialRoots: CategoryNode[] = [];
        const childIds = new Set<string>();
        map.forEach(n => n.children.forEach(c => childIds.add(c.id)));
        map.forEach(n => { if (!childIds.has(n.id)) potentialRoots.push(n); });

        const uniqueRoots = new Map<string, CategoryNode>();
        potentialRoots.forEach(r => {
            const key = r.code || r.name;
            if (uniqueRoots.has(key)) {
                const ex = uniqueRoots.get(key)!;
                r.id.split(',').forEach(id => { if (!ex.id.includes(id)) ex.id += ',' + id; });
                r.children.forEach(c => { if (!ex.children.find(cc => cc.id === c.id)) ex.children.push(c); });
            } else uniqueRoots.set(key, { ...r });
        });

        const sortTree = (nodes: CategoryNode[], lvl: number) => {
            nodes.sort((a,b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));
            nodes.forEach(n => {
                n.level = lvl;
                const unique = new Map<string, CategoryNode>();
                n.children.forEach(c => unique.set(c.id, c));
                n.children = Array.from(unique.values());
                sortTree(n.children, lvl + 1);
            });
        };
        const final = Array.from(uniqueRoots.values());
        sortTree(final, 0);
        return final;
    }, [categories]);

    const nodeTotals = useMemo(() => {
        const totalsMap = new Map<string, { budget: number[], realized: number[], radar: number[] }>();
        const calc = (node: CategoryNode): { budget: number[], realized: number[], radar: number[] } => {
            const b = new Array(12).fill(0), r = new Array(12).fill(0), rd = new Array(12).fill(0);
            if (node.children.length > 0) {
                node.children.forEach(c => {
                    const ct = calc(c);
                    for (let i=0; i<12; i++){ b[i]+=ct.budget[i]; r[i]+=ct.realized[i]; rd[i]+=ct.radar[i]; }
                });
            } else {
                const code = node.code || '';
                for (let i=0; i<12; i++){
                    const val = budgetValues[\`\${code}-\${i}\`];
                    if (val) { b[i] += val.amount; rd[i] += (val.radarAmount || 0); }
                    node.id.split(',').forEach(id => {
                        const rel = realizedValues[\`\${id.trim()}-\${i}\`];
                        if (rel) r[i] += rel;
                    });
                }
            }
            const res = { budget: b, realized: r, radar: rd };
            totalsMap.set(node.id, res);
            return res;
        };
        treeRoots.forEach(root => calc(root));
        return totalsMap;
    }, [treeRoots, budgetValues, realizedValues]);

    const dreStructure = useMemo(() => {
        const sumR = (roots: CategoryNode[], m: number, t: 'budget'|'realized'|'radar') =>
            roots.reduce((acc, r) => acc + (nodeTotals.get(r.id)?.[t][m] || 0), 0);
        const buckets = { rev: [] as CategoryNode[], taxes: [] as CategoryNode[], costs: [] as CategoryNode[], op: [] as CategoryNode[], admin: [] as CategoryNode[], fin: [] as CategoryNode[] };
        treeRoots.forEach(r => {
            const c = r.code || '';
            if (c.startsWith('01') || c.startsWith('1')) buckets.rev.push(r);
            else if (c.startsWith('02') || c.startsWith('2.1')) buckets.taxes.push(r);
            else if (c.startsWith('03') || c.startsWith('3')) buckets.costs.push(r);
            else if (c.startsWith('04') || c.startsWith('4')) buckets.op.push(r);
            else if (c.startsWith('05') || c.startsWith('5')) buckets.admin.push(r);
            else if (c.startsWith('06') || c.startsWith('6')) buckets.fin.push(r);
            else buckets.admin.push(r);
        });
        return {
            buckets,
            calc: (m: number, t: 'budget'|'realized'|'radar' = 'budget') => {
                const rev = sumR(buckets.rev, m, t), taxes = sumR(buckets.taxes, m, t), recLiq = rev - taxes;
                const costs = sumR(buckets.costs, m, t), gross = recLiq - costs, op = sumR(buckets.op, m, t);
                const contrib = gross - op, admin = sumR(buckets.admin, m, t), ebitda = contrib - admin;
                const fin = sumR(buckets.fin, m, t), net = ebitda - fin;
                return { rev, taxes, recLiq, costs, gross, op, contrib, admin, ebitda, fin, net };
            }
        };
    }, [treeRoots, nodeTotals]);

    const dreMonthlyData = MONTHS.map((_, i) => dreStructure.calc(i));

    const handleSaveBudget = async () => {
        if (!budgetModal) return;
        setIsSavingBudget(true);
        try {
            const entries: any[] = [];
            const ids = budgetModal.fullNodeId.split(',');
            const codeMatch = budgetModal.categoryName.match(/^([\\d.]+)/);
            const normCode = codeMatch ? codeMatch[1].split('.').map(s => parseInt(s, 10).toString()).join('.') : '';
            
            const isRevenue = normCode.startsWith('01') || normCode.startsWith('1');
            const isSalary = normCode.startsWith('03.1') || normCode.startsWith('3.1');

            for (let i = 0; i < 12; i++) {
                const amount = evaluateFormula(modalValues[i]);
                ids.forEach(id => {
                    const cat = categories.find(c => c.id === id);
                    if (!cat) return;
                    entries.push({
                        categoryId: id, month: i, year, costCenterId,
                        tenantId: cat.tenantId || tenantId,
                        amount: amount,
                        observation: i === budgetModal.startMonth ? modalObservation : null,
                        isLocked: (userRole === 'MASTER' ? lockedMonths[i] : undefined)
                    });
                });

                if (isRevenue && amount > 0) {
                    const taxAmt = amount * (taxRate > 0 ? taxRate/100 : 0.125);
                    const dasNodes: any[] = [];
                    const fDN = (nodes: any[]) => nodes.forEach(n => {
                        if ((n.code==='02.1'||n.code==='2.1') && n.children.length===0) dasNodes.push(n);
                        else if (n.children) fDN(n.children);
                    });
                    fDN(treeRoots);
                    dasNodes.forEach(dn => {
                        const targetId = dn.id.split(',')[0];
                        entries.push({ categoryId: targetId, month: i, year, costCenterId, tenantId, amount: taxAmt });
                    });
                }
            }

            const res = await fetch('/api/budgets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries }) });
            if (!res.ok) throw new Error('Erro ao salvar');

            setBudgetModal(null);
            // Refresh
            const refresh = await fetch(\`/api/budgets?costCenterId=\${costCenterId}&year=\${year}&t=\` + Date.now());
            const rData = await refresh.json();
            if (rData.success) {
                const idToCodeMap = new Map<string, string>();
                categories.forEach(c => {
                    const m = c.name.match(/^([\\d.]+)/);
                    if (m) idToCodeMap.set(c.id, m[1].split('.').map((s: any) => parseInt(s, 10).toString()).join('.'));
                });
                const values: Record<string, any> = {};
                (rData.data || []).forEach((item: any) => {
                    const c = idToCodeMap.get(item.categoryId);
                    if (c) values[\`\${c}-\${item.month - 1}\`] = { amount: item.amount, radarAmount: item.radarAmount, isLocked: item.isLocked, observation: item.observation };
                });
                setBudgetValues(values);
            }
        } catch (e: any) { alert(e.message); } finally { setIsSavingBudget(false); }
    };

    const toggleRow = (id: string) => { const s = new Set(expandedRows); s.has(id)?s.delete(id):s.add(id); setExpandedRows(s); };
    const toggleGroup = (g: string) => { const s = new Set(expandedGroups); s.has(g)?s.delete(g):s.add(g); setExpandedGroups(s); };

    const openBudgetModal = (nodeId: string, nodeName: string, month: number) => {
        if (isCCLocked && userRole !== 'MASTER') return alert('Travado');
        const ids = nodeId.split(',');
        const codeMatch = nodeName.match(/^([\\d.]+)/);
        const code = codeMatch ? codeMatch[1].split('.').map(s => parseInt(s, 10).toString()).join('.') : '';
        
        const vals = new Array(12).fill('').map((_, i) => (budgetValues[\`\${code}-\${i}\`]?.amount || '').toString());
        const locks = new Array(12).fill(false).map((_, i) => !!budgetValues[\`\${code}-\${i}\`]?.isLocked);
        setBudgetModal({ categoryId: ids[0], fullNodeId: nodeId, categoryName: nodeName, startMonth: month });
        setModalValues(vals); setLockedMonths(locks); setActiveMonth(month);
        setModalObservation(budgetValues[\`\${code}-\${month}\`]?.observation || '');
    };

    const handleSubmit = async (action: string) => {
        setIsSubmitting(true);
        try {
            const res = await fetch('/api/cost-centers/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ costCenterId, tenantId, year, action }) });
            const d = await res.json();
            if (d.success) { setApprovalStatus(d.newStatus); alert('Sucesso'); }
        } catch { alert('Erro'); } finally { setIsSubmitting(false); }
    };

    const renderNode = (node: CategoryNode): React.ReactNode => {
        const hasChildren = node.children.length > 0;
        const expanded = expandedRows.has(node.id);
        const totals = nodeTotals.get(node.id);
        
        return (
            <React.Fragment key={node.id}>
                <tr onClick={() => hasChildren && toggleRow(node.id)} style={{ borderBottom: '1px solid var(--border-subtle)', background: node.level===0?'var(--bg-surface)':'var(--bg-base)', cursor: hasChildren?'pointer':'default' }} className="hover-row">
                    <td style={{ padding: '0.85rem 1rem', position: 'sticky', left: 0, background: 'inherit', zIndex: 10, fontSize: '0.8rem', minWidth: '380px', width: '380px', borderRight: '1px solid var(--border-subtle)', fontWeight: node.level===0?700:400 }}>
                        <div style={{ display: 'flex', alignItems: 'center', paddingLeft: \`\${node.level*1.5}rem\` }}>
                            {hasChildren && <span style={{ marginRight: '0.6rem', color: 'var(--accent-blue)' }}>{expanded ? '▼' : '▶'}</span>}
                            {!hasChildren && <span style={{ width: '1.6rem' }}></span>}
                            {node.name}
                        </div>
                    </td>
                    {MONTHS.map((_, i) => (
                        <td key={i} onClick={(e) => { e.stopPropagation(); if(!hasChildren) openBudgetModal(node.id, node.name, i); }} style={{ padding: '0.85rem 1rem', textAlign: 'right', fontSize: '0.8rem', borderRight: '1px solid var(--border-subtle)', cursor: hasChildren?'default':'pointer' }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span>{totals?.budget[i] === 0 ? '-' : fmt(totals?.budget[i] || 0)}</span>
                            </div>
                        </td>
                    ))}
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontSize: '0.8rem', fontWeight: 800, background: 'var(--bg-surface)' }}>
                        {fmt((totals?.budget || []).reduce((a,b)=>a+b, 0))}
                    </td>
                </tr>
                {expanded && node.children.map(c => renderNode(c))}
            </React.Fragment>
        );
    };

    const renderSummaryRow = (label: string, vals: number[], bold=false, bg='var(--bg-elevated)', color='var(--text-primary)', gid?: string) => {
        const exp = gid ? expandedGroups.has(gid) : true;
        return (
            <tr onClick={() => gid && toggleGroup(gid)} style={{ background: bg, fontWeight: bold?800:600, cursor: gid?'pointer':'default' }}>
                <td style={{ padding: '0.85rem 1rem', position: 'sticky', left: 0, background: 'inherit', color: color, fontSize: '0.85rem', minWidth: '380px', borderRight: '1px solid var(--border-default)' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        {gid && <span style={{ marginRight: '0.75rem' }}>{exp ? '▼' : '▶'}</span>}
                        {label}
                    </div>
                </td>
                {MONTHS.map((_, i) => (
                    <td key={i} style={{ padding: '0.6rem 1rem', textAlign: 'right', fontSize: '0.8rem', color: color }}>
                        {vals[i] === 0 ? '-' : fmt(vals[i])}
                    </td>
                ))}
                <td style={{ padding: '0.6rem 1rem', textAlign: 'right', fontSize: '0.8rem', fontWeight: 800, color: color }}>
                    {fmt(vals.reduce((a,b)=>a+b, 0))}
                </td>
            </tr>
        );
    };

    if (loading) return <div style={{ display:'flex', height:'60vh', alignItems:'center', justifyContent:'center' }}>Carregando...</div>;

    const statusInfo = { bg: 'rgba(251,191,36,0.1)', color: '#f59e0b', label: '⏳ Status: ' + approvalStatus };

    return (
        <div style={{ padding: '1.5rem 2rem' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'1.5rem', background: statusInfo.bg, padding:'1rem', borderRadius:'8px', border:\`1px solid \${statusInfo.color}30\` }}>
                <span style={{ fontWeight:700, color: statusInfo.color }}>{statusInfo.label}</span>
                <div style={{ display:'flex', gap:'0.5rem' }}>
                    {approvalStatus==='PENDING' && <button onClick={() => handleSubmit('SUBMIT_N1')} className="btn btn-primary" style={{fontSize:'0.8rem'}}>Enviar Aprovação</button>}
                    <button onClick={() => { setExpandedGroups(new Set(['rev', 'taxes', 'costs', 'op', 'admin', 'fin'])); }} className="btn btn-secondary" style={{fontSize:'0.8rem'}}>Expandir</button>
                    <button onClick={() => { setExpandedGroups(new Set()); setExpandedRows(new Set()); }} className="btn btn-secondary" style={{fontSize:'0.8rem'}}>Recolher</button>
                </div>
            </div>

            <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1200px' }}>
                    <thead>
                        <tr style={{ background: 'var(--bg-surface)' }}>
                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.65rem', position: 'sticky', left: 0, background: 'var(--bg-surface)', zIndex: 20 }}>ESTRUTURA DRE</th>
                            {MONTHS.map(m => <th key={m} style={{ padding: '0.85rem 1rem', textAlign: 'right', fontSize: '0.65rem' }}>{m}</th>)}
                            <th style={{ padding: '0.85rem 1rem', textAlign: 'right', fontSize: '0.65rem' }}>TOTAL</th>
                        </tr>
                    </thead>
                    <tbody>
                        {renderSummaryRow('01. RECEITA BRUTA', dreMonthlyData.map(d => d.rev), true, 'var(--bg-elevated)', 'var(--accent-blue)', 'rev')}
                        {expandedGroups.has('rev') && dreStructure.buckets.rev.map(r => renderNode(r))}
                        {renderSummaryRow('02. Tributos', dreMonthlyData.map(d => d.taxes), true, 'var(--bg-surface)', 'var(--text-secondary)', 'taxes')}
                        {expandedGroups.has('taxes') && dreStructure.buckets.taxes.map(r => renderNode(r))}
                        {renderSummaryRow('(=) RECEITA LÍQUIDA', dreMonthlyData.map(d => d.recLiq), true, '#eff6ff', 'var(--accent-blue)')}
                        {renderSummaryRow('03. Custos', dreMonthlyData.map(d => d.costs), true, 'var(--bg-surface)', 'var(--text-secondary)', 'costs')}
                        {expandedGroups.has('costs') && dreStructure.buckets.costs.map(r => renderNode(r))}
                        {renderSummaryRow('(=) MARGEM BRUTA', dreMonthlyData.map(d => d.gross), true, '#f0fdf4', 'var(--accent-green)')}
                        {renderSummaryRow('04. Despesas Operacionais', dreMonthlyData.map(d => d.op), true, 'var(--bg-surface)', 'var(--text-secondary)', 'op')}
                        {expandedGroups.has('op') && dreStructure.buckets.op.map(r => renderNode(r))}
                        {renderSummaryRow('05. Despesas Administrativas', dreMonthlyData.map(d => d.admin), true, 'var(--bg-surface)', 'var(--text-secondary)', 'admin')}
                        {expandedGroups.has('admin') && dreStructure.buckets.admin.map(r => renderNode(r))}
                        {renderSummaryRow('(=) EBITDA', dreMonthlyData.map(d => d.ebitda), true, '#f5f3ff', 'var(--accent-indigo)')}
                        {renderSummaryRow('06. Despesas Financeiras', dreMonthlyData.map(d => d.fin), true, 'var(--bg-surface)', 'var(--text-secondary)', 'fin')}
                        {expandedGroups.has('fin') && dreStructure.buckets.fin.map(r => renderNode(r))}
                        {renderSummaryRow('(=) LUCRO LÍQUIDO', dreMonthlyData.map(d => d.net), true, 'var(--gradient-brand)', 'white')}
                    </tbody>
                </table>
            </div>

            {budgetModal && (
                <div className="modal-overlay" style={{ zIndex: 1200 }}>
                    <div className="modal-content" style={{ maxWidth: '600px', backgroundColor: '#fff', padding: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                            <h3 style={{ margin: 0 }}>Orçado: {budgetModal.categoryName}</h3>
                            <button onClick={() => setBudgetModal(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                            {MONTHS.map((m, idx) => (
                                <div key={m} style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                    <label style={{ fontSize: '0.7rem', fontWeight: 700 }}>{m}</label>
                                    <input
                                        type="text"
                                        value={modalValues[idx]}
                                        onFocus={() => setActiveMonth(idx)}
                                        onChange={(e) => { const n = [...modalValues]; n[idx]=e.target.value; setModalValues(n); }}
                                        style={{ width: '100%', padding: '0.4rem', border: activeMonth===idx?'1px solid #2563eb':'1px solid #ddd' }}
                                    />
                                </div>
                            ))}
                        </div>
                        <textarea
                            value={modalObservation}
                            onChange={(e) => setModalObservation(e.target.value)}
                            placeholder="Observação..."
                            style={{ width: '100%', minHeight: '60px', marginBottom: '1.5rem', padding: '0.5rem' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <button onClick={() => setBudgetModal(null)} className="btn btn-secondary">Cancelar</button>
                            <button onClick={handleSaveBudget} disabled={isSavingBudget} className="btn btn-primary">{isSavingBudget ? 'Salvando...' : 'Salvar'}</button>
                        </div>
                    </div>
                </div>
            )}

            <style>{\`
                .btn { padding: 0.5rem 1rem; border-radius: 6px; font-weight: 600; cursor: pointer; border: none; transition: 0.2s; }
                .btn-primary { background: #2563eb; color: #fff; }
                .btn-secondary { background: #f1f5f9; color: #475569; }
                .hover-row:hover { background: rgba(0,0,0,0.02) !important; }
            \`}</style>
        </div>
    );
}
