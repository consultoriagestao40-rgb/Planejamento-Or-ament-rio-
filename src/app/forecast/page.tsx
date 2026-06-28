'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';

const parseContractName = (rawName: string) => {
    let name = rawName;
    let split: Record<string, number> = {};
    let seller = '';

    if (name.includes(' |__SPLIT__:')) {
        const parts = name.split(' |__SPLIT__:');
        name = parts[0];
        const rest = parts[1];
        if (rest.includes(' |__SELLER__:')) {
            const subParts = rest.split(' |__SELLER__:');
            try {
                split = JSON.parse(subParts[0]);
            } catch (e) {}
            seller = subParts[1];
        } else {
            try {
                split = JSON.parse(rest);
            } catch (e) {}
        }
    } else if (name.includes(' |__SELLER__:')) {
        const parts = name.split(' |__SELLER__:');
        name = parts[0];
        seller = parts[1];
    }

    return { name, split, seller };
};

const monthsName = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const fmt = (v: number) => {
    const absolute = Math.abs(v);
    const formatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(absolute);
    return v < 0 ? `- ${formatted}` : formatted;
};

export default function ForecastPage() {
    const [companies, setCompanies] = useState<any[]>([]);
    const [selectedTenant, setSelectedTenant] = useState('');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [activeMonth, setActiveMonth] = useState(new Date().getMonth() + 1); // 1-12
    const [contracts, setContracts] = useState<any[]>([]);
    const [coefficients, setCoefficients] = useState<any[]>([]);
    const [forecastData, setForecastData] = useState<any[]>([]);
    const [loadingData, setLoadingData] = useState(false);
    const [activeTab, setActiveTab] = useState<'grid' | 'coefficients' | 'simulator'>('grid');
    const [showAV, setShowAV] = useState(false);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set([
        'G-01', 'G-02', 'G-03', 'G-04', 'G-05', 'G-06', 'G-07',
        'G-01.1', 'G-01.2', 'G-02.1', 'G-03.1', 'G-03.2', 'G-03.3', 'G-03.4', 'G-03.5', 'G-03.7', 'G-03.8', 'G-03.9'
    ]));

    // Modal/Form States for Simulated Contract
    const [isContractModalOpen, setIsContractModalOpen] = useState(false);
    const [editingContractId, setEditingContractId] = useState<string | null>(null);
    const [contractName, setContractName] = useState('');
    const [contractValue, setContractValue] = useState(0);
    const [contractStartMonth, setContractStartMonth] = useState(6);
    const [contractProbability, setContractProbability] = useState(100);
    const [contractStatus, setContractStatus] = useState('PIPELINE');
    const [contractTenantId, setContractTenantId] = useState('');
    const [contractSeller, setContractSeller] = useState('');
    const [contractRevenueSplit, setContractRevenueSplit] = useState<Record<string, number>>({});
    const [selectedRevenueCode, setSelectedRevenueCode] = useState('');
    const [typedRevenueValue, setTypedRevenueValue] = useState('');
    const [viewingContractDetails, setViewingContractDetails] = useState<any | null>(null);
    const [expandedContractRows, setExpandedContractRows] = useState<Set<string>>(new Set([
        'G-01', 'G-02', 'G-03', 'G-04', 'G-05', 'G-06', 'G-07',
        'G-01.1', 'G-01.2', 'G-02.1', 'G-03.1', 'G-03.2', 'G-03.3', 'G-03.4', 'G-03.5', 'G-03.7', 'G-03.8', 'G-03.9'
    ]));

    // Coefficient Edit State
    const [editingCoefId, setEditingCoefId] = useState<string | null>(null);
    const [editingCoefValue, setEditingCoefValue] = useState(0);

    const toggleRow = (id: string) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleExpandAll = () => {
        const allIds = new Set<string>();
        const collectIds = (nodes: any[]) => {
            nodes.forEach(n => {
                if (n.children && n.children.length > 0) {
                    allIds.add(n.categoryId);
                    collectIds(n.children);
                }
            });
        };
        collectIds(displayGrid);
        setExpandedRows(allIds);
    };

    const handleCollapseAll = () => {
        setExpandedRows(new Set());
    };

    const toggleContractRow = (id: string) => {
        setExpandedContractRows(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const contractDreGrid = useMemo(() => {
        if (!viewingContractDetails) return [];

        const val = viewingContractDetails.value;
        const tenantCoefs = coefficients.filter(c => {
            const codeMatch = c.categoryName.match(/^([\d.]+)/);
            const code = codeMatch ? codeMatch[1] : '';
            return !(code === '2' || code.startsWith('2.') || code.startsWith('2'));
        });

        const createNode = (id: string, name: string, level: number, isFormula = false) => ({
            categoryId: id,
            categoryName: name,
            level,
            isFormula,
            value: 0,
            av: 0,
            children: [] as any[]
        });

        // 1. Build static parent nodes structure
        const recBruta = createNode('G-01', '01. RECEITA BRUTA', 0);
        const recServicos = createNode('G-01.1', '01.1 - Receita de Serviços', 1);
        const recVendas = createNode('G-01.2', '01.2 - Receitas de Vendas', 1);
        recBruta.children = [recServicos, recVendas];

        const tributos = createNode('G-02', '02. Tributo sobre Faturamento', 0);
        const tribSub = createNode('G-02.1', '02.1 - Tributos', 1);
        tributos.children = [tribSub];

        const recLiquida = createNode('F-RL', '(=) RECEITA LÍQUIDA', 0, true);

        const custosOp = createNode('G-03', '03. CUSTOS OPERACIONAIS (TOTAL)', 0);
        const custosSubs: Record<string, any> = {
            '03.1': createNode('G-03.1', '03.1 Salários e Remuneração', 1),
            '03.2': createNode('G-03.2', '03.2 Encargos Sociais', 1),
            '03.3': createNode('G-03.3', '03.3 Benefícios', 1),
            '03.4': createNode('G-03.4', '03.4 Diárias', 1),
            '03.5': createNode('G-03.5', '03.5 SSMA', 1),
            '03.6': createNode('G-03.6', '03.6 Materiais', 1),
            '03.7': createNode('G-03.7', '03.7 Equipamentos', 1),
            '03.8': createNode('G-03.8', '03.8 Comunicação/Sistema/Licenças', 1),
            '03.9': createNode('G-03.9', '03.9 Custo com Veículo', 1),
            '03.10': createNode('G-03.10', '03.10 Custos Transferidos', 1),
        };
        custosOp.children = Object.values(custosSubs);

        const margemBruta = createNode('F-MB', '(=) MARGEM BRUTA', 0, true);

        const { name: cleanName, split: customSplit } = parseContractName(viewingContractDetails.name);
        const hasCustomSplit = Object.keys(customSplit).length > 0;

        // 2. Classify leaf categories from coefficients state and populate their values/AV
        tenantCoefs.forEach(coef => {
            const name = coef.categoryName;
            const codeMatch = name.match(/^([\d.]+)/);
            const code = codeMatch ? codeMatch[1] : '';

            // Skip gross revenue itself to avoid doubling
            if (code === '01' || code === '01.1' || code === '01.2' || code === '02.1' || code === '03') return;

            const isRevenue = code.startsWith('01.') || code.startsWith('1.');
            const pct = coef.percentage;
            
            let itemValue = 0;
            let itemAv = 0;

            if (isRevenue) {
                if (hasCustomSplit) {
                    const splitVal = customSplit[code] || 0;
                    itemValue = splitVal;
                    itemAv = val > 0 ? (splitVal / val) * 100 : 0;
                } else {
                    itemValue = 0;
                    itemAv = pct;
                }
            } else {
                itemValue = (val * (pct / 100)) * -1;
                itemAv = pct * -1;
            }

            const leafNode = {
                categoryId: coef.categoryId,
                categoryName: name,
                level: 0,
                isFormula: false,
                value: itemValue,
                av: itemAv,
                children: []
            };

            let parentNode = null;
            const parts = code.split('.');
            if (parts.length >= 2) {
                const subPrefix = `${parts[0]}.${parts[1]}`;
                
                // Skip if this leaf node matches the parent node code exactly to avoid duplication
                if (code === subPrefix) return;

                if (code.startsWith('01.1.') || code.startsWith('1.1.')) {
                    parentNode = recServicos;
                } else if (code.startsWith('01.2.') || code.startsWith('1.2.')) {
                    parentNode = recVendas;
                } else if (code.startsWith('02.1.') || code.startsWith('2.1.')) {
                    parentNode = tribSub;
                } else if (code.startsWith('03.')) {
                    parentNode = custosSubs[subPrefix];
                }
            }

            if (parentNode) {
                leafNode.level = parentNode.level + 1;
                parentNode.children.push(leafNode);
            }
        });

        // 3. Roll up child values/percentages to parent subcategories
        const rollupNode = (node: any) => {
            if (node.children && node.children.length > 0) {
                node.children.forEach(rollupNode);
                node.value = node.children.reduce((sum: number, c: any) => sum + c.value, 0);
                node.av = node.children.reduce((sum: number, c: any) => sum + c.av, 0);
            }
        };

        // Roll up first for costs and taxes
        [tribSub].forEach(rollupNode);
        Object.values(custosSubs).forEach(rollupNode);

        if (hasCustomSplit) {
            rollupNode(recServicos);
            rollupNode(recVendas);
        } else {
            // Compute revenue splits based on children AV sum relative to total contract value (val)
            const pctServicos = recServicos.children.reduce((sum, c) => sum + Math.abs(c.av), 0);
            const pctVendas = recVendas.children.reduce((sum, c) => sum + Math.abs(c.av), 0);
            const totalPct = (pctServicos + pctVendas) || 100;

            recServicos.value = val * (pctServicos / totalPct);
            recServicos.av = (pctServicos / totalPct) * 100;

            recVendas.value = val * (pctVendas / totalPct);
            recVendas.av = (pctVendas / totalPct) * 100;

            // Distribute revenue to children so they sum up to their parent's value
            const distributeRevenue = (parentNode: any) => {
                const totalChildPct = parentNode.children.reduce((sum: number, c: any) => sum + Math.abs(c.av), 0);
                parentNode.children.forEach((c: any) => {
                    if (totalChildPct > 0) {
                        c.value = parentNode.value * (Math.abs(c.av) / totalChildPct);
                        c.av = parentNode.av * (Math.abs(c.av) / totalChildPct);
                    } else if (parentNode.children.length > 0 && c.categoryName.includes('01.1.1')) {
                        c.value = parentNode.value;
                        c.av = parentNode.av;
                    } else {
                        c.value = 0;
                        c.av = 0;
                    }
                });
            };

            distributeRevenue(recServicos);
            distributeRevenue(recVendas);
        }

        // Sort children by code prefix
        const sortChildrenByCode = (node: any) => {
            if (node.children && node.children.length > 0) {
                node.children.sort((a: any, b: any) => {
                    const aCodeMatch = a.categoryName.match(/^([\d.]+)/);
                    const bCodeMatch = b.categoryName.match(/^([\d.]+)/);
                    const aCode = aCodeMatch ? aCodeMatch[1] : a.categoryName;
                    const bCode = bCodeMatch ? bCodeMatch[1] : b.categoryName;
                    return aCode.localeCompare(bCode, undefined, { numeric: true, sensitivity: 'base' });
                });
                node.children.forEach(sortChildrenByCode);
            }
        };

        [recServicos, recVendas, tribSub].forEach(sortChildrenByCode);
        Object.values(custosSubs).forEach(sortChildrenByCode);

        // 4. If children are empty for a node (e.g. no database categories yet), fallback to getCoefPct
        const getCoefPct = (code: string) => {
            const match = tenantCoefs.find(c => {
                const cName = c.categoryName;
                const cMatch = cName.match(/^([\d.]+)/);
                const cCode = cMatch ? cMatch[1] : c.categoryId;
                return cCode === code;
            });
            return match ? match.percentage : 0;
        };

        if (recServicos.children.length === 0 && recVendas.children.length === 0) {
            recServicos.value = val;
            recServicos.av = 100.0;
        }

        if (tribSub.children.length === 0) {
            tribSub.value = - (val * (getCoefPct('02.1') / 100));
            tribSub.av = - getCoefPct('02.1');
        }

        Object.keys(custosSubs).forEach(subCode => {
            if (custosSubs[subCode].children.length === 0) {
                const pct = getCoefPct(subCode);
                custosSubs[subCode].value = - (val * (pct / 100));
                custosSubs[subCode].av = - pct;
            }
        });

        // 5. Final rollout of top groups and formulas
        recBruta.value = recServicos.value + recVendas.value;
        recBruta.av = 100.0; // standard 100% base

        tributos.value = tribSub.value;
        tributos.av = tribSub.av;

        custosOp.value = Object.values(custosSubs).reduce((sum, n) => sum + n.value, 0);
        custosOp.av = Object.values(custosSubs).reduce((sum, n) => sum + n.av, 0);

        recLiquida.value = recBruta.value + tributos.value;
        recLiquida.av = recBruta.av + tributos.av;

        margemBruta.value = recLiquida.value + custosOp.value;
        margemBruta.av = recLiquida.av + custosOp.av;

        const rootNodes = [recBruta, tributos, recLiquida, custosOp, margemBruta];

        // Flatten based on expandedContractRows state
        const flatList: any[] = [];
        const flatten = (node: any) => {
            flatList.push(node);
            if (node.children && node.children.length > 0 && expandedContractRows.has(node.categoryId)) {
                node.children.forEach(flatten);
            }
        };
        rootNodes.forEach(flatten);

        return flatList;
    }, [viewingContractDetails, coefficients, expandedContractRows]);

    const coefTreeGrid = useMemo(() => {
        const tenantCoefs = coefficients.filter(c => {
            const codeMatch = c.categoryName.match(/^([\d.]+)/);
            const code = codeMatch ? codeMatch[1] : '';
            return !(code === '2' || code.startsWith('2.') || code.startsWith('2'));
        });

        const createNode = (id: string, name: string, level: number, isFormula = false) => ({
            categoryId: id,
            categoryName: name,
            level,
            isFormula,
            percentage: 0,
            isOverride: false,
            children: [] as any[]
        });

        const tributos = createNode('G-02', '02. Tributo sobre Faturamento', 0);
        const tribSub = createNode('G-02.1', '02.1 - Tributos', 1);
        tributos.children = [tribSub];

        const custosOp = createNode('G-03', '03. CUSTOS OPERACIONAIS (TOTAL)', 0);
        const custosSubs: Record<string, any> = {
            '03.1': createNode('G-03.1', '03.1 Salários e Remuneração', 1),
            '03.2': createNode('G-03.2', '03.2 Encargos Sociais', 1),
            '03.3': createNode('G-03.3', '03.3 Benefícios', 1),
            '03.4': createNode('G-03.4', '03.4 Diárias', 1),
            '03.5': createNode('G-03.5', '03.5 SSMA', 1),
            '03.6': createNode('G-03.6', '03.6 Materiais', 1),
            '03.7': createNode('G-03.7', '03.7 Equipamentos', 1),
            '03.8': createNode('G-03.8', '03.8 Comunicação/Sistema/Licenças', 1),
            '03.9': createNode('G-03.9', '03.9 Custo com Veículo', 1),
            '03.10': createNode('G-03.10', '03.10 Custos Transferidos', 1),
        };
        custosOp.children = Object.values(custosSubs);

        // Classify leaf categories from coefficients state and populate their percentages
        tenantCoefs.forEach(coef => {
            const name = coef.categoryName;
            const codeMatch = name.match(/^([\d.]+)/);
            const code = codeMatch ? codeMatch[1] : '';

            if (code === '02.1' || code === '03') return;

            const leafNode = {
                categoryId: coef.categoryId,
                categoryName: name,
                level: 0,
                isFormula: false,
                percentage: coef.percentage,
                isOverride: coef.isOverride,
                children: []
            };

            let parentNode = null;
            const parts = code.split('.');
            if (parts.length >= 2) {
                const subPrefix = `${parts[0]}.${parts[1]}`;
                
                // Skip if this leaf node matches the parent node code exactly to avoid duplication
                if (code === subPrefix) return;

                if (code.startsWith('02.1.') || code.startsWith('2.1.')) {
                    parentNode = tribSub;
                } else if (code.startsWith('03.')) {
                    parentNode = custosSubs[subPrefix];
                }
            }

            if (parentNode) {
                leafNode.level = parentNode.level + 1;
                parentNode.children.push(leafNode);
            }
        });

        // Roll up percentages to parent subcategories
        const rollupPct = (node: any) => {
            if (node.children && node.children.length > 0) {
                node.children.forEach(rollupPct);
                node.percentage = node.children.reduce((sum: number, c: any) => sum + c.percentage, 0);
                node.isOverride = node.children.some((c: any) => c.isOverride);
            }
        };

        rollupPct(tribSub);
        Object.values(custosSubs).forEach(rollupPct);

        tributos.percentage = tribSub.percentage;
        tributos.isOverride = tribSub.isOverride;

        custosOp.percentage = Object.values(custosSubs).reduce((sum, n) => sum + n.percentage, 0);
        custosOp.isOverride = Object.values(custosSubs).some(n => n.isOverride);

        // Sort children by code prefix
        const sortChildrenByCode = (node: any) => {
            if (node.children && node.children.length > 0) {
                node.children.sort((a: any, b: any) => {
                    const aCodeMatch = a.categoryName.match(/^([\d.]+)/);
                    const bCodeMatch = b.categoryName.match(/^([\d.]+)/);
                    const aCode = aCodeMatch ? aCodeMatch[1] : a.categoryName;
                    const bCode = bCodeMatch ? bCodeMatch[1] : b.categoryName;
                    return aCode.localeCompare(bCode, undefined, { numeric: true, sensitivity: 'base' });
                });
                node.children.forEach(sortChildrenByCode);
            }
        };

        [tribSub].forEach(sortChildrenByCode);
        Object.values(custosSubs).forEach(sortChildrenByCode);

        const rootNodes = [tributos, custosOp];

        const flatList: any[] = [];
        const flatten = (node: any) => {
            flatList.push(node);
            if (node.children && node.children.length > 0 && expandedContractRows.has(node.categoryId)) {
                node.children.forEach(flatten);
            }
        };
        rootNodes.forEach(flatten);

        return flatList;
    }, [coefficients, expandedContractRows]);

    const revenueCategories = useMemo(() => {
        return coefficients.filter(c => {
            const codeMatch = c.categoryName.match(/^([\d.]+)/);
            const code = codeMatch ? codeMatch[1] : '';
            return code.startsWith('01.1.') || code.startsWith('01.2.') || code.startsWith('1.1.') || code.startsWith('1.2.');
        }).sort((a, b) => a.categoryName.localeCompare(b.categoryName));
    }, [coefficients]);

    const fetchSetup = useCallback(async () => {
        try {
            const res = await fetch('/api/companies');
            const json = await res.json();
            if (json.success && json.companies) {
                setCompanies(json.companies);
                const cached = localStorage.getItem('selectedTenantId') || 'ALL';
                setSelectedTenant(cached);
            }
        } catch (e) {
            console.error('Error in setup fetch:', e);
        }
    }, []);

    useEffect(() => {
        fetchSetup();
    }, [fetchSetup]);

    const fetchData = useCallback(async (silent = false) => {
        if (!selectedTenant) return;
        if (!silent) setLoadingData(true);
        try {
            // Fetch contracts
            const resC = await fetch(`/api/kpi/forecast/contracts?tenantId=${selectedTenant}&year=${selectedYear}`);
            const jsonC = await resC.json();
            if (jsonC.success) setContracts(jsonC.data || []);

            // Fetch coefficients
            const resCoef = await fetch(`/api/kpi/forecast/coefficients?tenantId=${selectedTenant}&year=${selectedYear}`);
            const jsonCoef = await resCoef.json();
            if (jsonCoef.success) setCoefficients(jsonCoef.data || []);

            // Fetch DRE forecast data
            const resD = await fetch(`/api/kpi/forecast/data?tenantId=${selectedTenant}&year=${selectedYear}&activeMonth=${activeMonth}`);
            const jsonD = await resD.json();
            if (jsonD.success) setForecastData(jsonD.data || []);
        } catch (err) {
            console.error(err);
        } finally {
            if (!silent) setLoadingData(false);
        }
    }, [selectedTenant, selectedYear, activeMonth]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const formatCurrencyInput = (valueStr: string) => {
        const digits = valueStr.replace(/\D/g, '');
        if (!digits) return '';
        const numberValue = parseFloat(digits) / 100;
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(numberValue);
    };

    const parseCurrencyInput = (formattedStr: string) => {
        const digits = formattedStr.replace(/\D/g, '');
        if (!digits) return 0;
        return parseFloat(digits) / 100;
    };

    const handleAddRevenue = () => {
        if (!selectedRevenueCode) {
            alert('Por favor, selecione uma conta de receita.');
            return;
        }
        const valNum = parseCurrencyInput(typedRevenueValue);
        if (valNum <= 0) {
            alert('Por favor, informe um valor de receita válido.');
            return;
        }
        setContractRevenueSplit(prev => {
            const next = { ...prev, [selectedRevenueCode]: valNum };
            const total = Object.values(next).reduce((sum, v) => sum + (v || 0), 0);
            setContractValue(total);
            return next;
        });
        setTypedRevenueValue('');
    };

    const handleRemoveRevenue = (code: string) => {
        setContractRevenueSplit(prev => {
            const next = { ...prev };
            delete next[code];
            const total = Object.values(next).reduce((sum, v) => sum + (v || 0), 0);
            setContractValue(total);
            return next;
        });
    };

    const handleSaveContract = async () => {
        if (!contractName.trim() || contractValue <= 0) {
            alert('Por favor, informe o nome e um valor válido.');
            return;
        }

        const splitPayload = Object.fromEntries(
            Object.entries(contractRevenueSplit).filter(([_, v]) => v > 0)
        );

        if (Object.keys(splitPayload).length === 0) {
            alert('Por favor, preencha o valor de faturamento em pelo menos uma das contas de receita na distribuição abaixo.');
            return;
        }

        let nameWithMeta = contractName.trim();
        nameWithMeta += ' |__SPLIT__:' + JSON.stringify(splitPayload);
        if (contractSeller.trim()) {
            nameWithMeta += ' |__SELLER__:' + contractSeller.trim();
        }

        const targetTenant = selectedTenant === 'ALL' ? contractTenantId : selectedTenant;
        if (!targetTenant) {
            alert('Por favor, selecione uma empresa de destino.');
            return;
        }

        try {
            const res = await fetch('/api/kpi/forecast/contracts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: editingContractId || undefined,
                    tenantId: targetTenant,
                    name: nameWithMeta,
                    value: contractValue,
                    startMonth: contractStartMonth,
                    startYear: selectedYear,
                    probability: contractProbability,
                    status: contractStatus
                })
            });
            const json = await res.json();
            if (json.success) {
                setIsContractModalOpen(false);
                setEditingContractId(null);
                setContractName('');
                setContractValue(0);
                setContractStartMonth(6);
                setContractProbability(100);
                setContractStatus('PIPELINE');
                setContractTenantId('');
                setContractSeller('');
                setContractRevenueSplit({});
                setSelectedRevenueCode('');
                setTypedRevenueValue('');
                fetchData();
            } else {
                alert(`Erro ao salvar: ${json.error}`);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleDeleteContract = async (id: string) => {
        if (!confirm('Deseja excluir este contrato da simulação?')) return;
        try {
            const res = await fetch(`/api/kpi/forecast/contracts?id=${id}`, { method: 'DELETE' });
            const json = await res.json();
            if (json.success) {
                fetchData();
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleSaveCoefficientOverride = async (categoryId: string, val: number) => {
        try {
            const res = await fetch('/api/kpi/forecast/coefficients', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId: selectedTenant,
                    year: selectedYear,
                    categoryId,
                    percentage: val
                })
            });
            const json = await res.json();
            if (json.success) {
                setEditingCoefId(null);
                fetchData(true);
            } else {
                alert(`Erro ao salvar: ${json.error}`);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const displayGrid = useMemo(() => {
        if (forecastData.length === 0) return [];

        const buildDreTree = (flatData: any[]) => {
            const createNode = (id: string, name: string, level: number, isFormula = false) => ({
                categoryId: id,
                categoryName: name,
                level,
                isFormula,
                realized: Array(12).fill(0),
                budget: Array(12).fill(0),
                forecast: Array(12).fill(0),
                children: [] as any[]
            });

            // Main parent groups
            const recBruta = createNode('G-01', '01. RECEITA BRUTA', 0);
            const recServicos = createNode('G-01.1', '01.1 - Receita de Serviços', 1);
            const recVendas = createNode('G-01.2', '01.2 - Receitas de Vendas', 1);
            recBruta.children = [recServicos, recVendas];

            const tributos = createNode('G-02', '02. Tributo sobre Faturamento', 0);
            const tribSub = createNode('G-02.1', '02.1 - Tributos', 1);
            tributos.children = [tribSub];

            const recLiquida = createNode('F-RL', '(=) RECEITA LÍQUIDA', 0, true);

            const custosOp = createNode('G-03', '03. Custo Operacional', 0);
            const custosSubs: Record<string, any> = {
                '03.1': createNode('G-03.1', '03.1 Salarios e Remuneração', 1),
                '03.2': createNode('G-03.2', '03.2 Encargos Sociais', 1),
                '03.3': createNode('G-03.3', '03.3 Beneficios', 1),
                '03.4': createNode('G-03.4', '03.4 Diárias', 1),
                '03.5': createNode('G-03.5', '03.5 SSMA', 1),
                '03.6': createNode('G-03.6', '03.6 Materiais', 1),
                '03.7': createNode('G-03.7', '03.7 Equipamentos', 1),
                '03.8': createNode('G-03.8', '03.8 Comunicação/Sistema/Licenças', 1),
                '03.9': createNode('G-03.9', '03.9 Custo com Veiculo', 1),
                '03.10': createNode('G-03.10', '03.10 Custos Transferidos', 1),
            };
            custosOp.children = Object.values(custosSubs);

            const margemBruta = createNode('F-MB', '(=) MARGEM BRUTA', 0, true);

            const despVendas = createNode('G-04', '04. Despesa Operacional', 0);
            const despVendasSubs: Record<string, any> = {
                '04.1': createNode('G-04.1', '04.1 Salarios e Remuneração', 1),
                '04.2': createNode('G-04.2', '04.2 Encargos Sociais', 1),
                '04.3': createNode('G-04.3', '04.3 Beneficios', 1),
                '04.4': createNode('G-04.4', '04.4 SSMA', 1),
                '04.5': createNode('G-04.5', '04.5 Viagens', 1),
                '04.6': createNode('G-04.6', '04.6 Custo com Veículos', 1),
                '04.7': createNode('G-04.7', '04.7 Cartão Corporativo', 1),
                '04.8': createNode('G-04.8', '04.8 Serviços Terceirizados', 1),
            };
            despVendas.children = Object.values(despVendasSubs);

            const margemContrib = createNode('F-MC', '(=) MARGEM DE CONTRIBUIÇÃO', 0, true);

            const despAdmin = createNode('G-05', '05. Despesas Administrativas', 0);
            const despAdminSubs: Record<string, any> = {
                '05.1': createNode('G-05.1', '05.1 Salario e Remuneração', 1),
                '05.2': createNode('G-05.2', '05.2 Encargos Sociais', 1),
                '05.3': createNode('G-05.3', '05.3 Beneficios', 1),
                '05.4': createNode('G-05.4', '05.4 SSMA', 1),
                '05.5': createNode('G-05.5', '05.5 Viagens', 1),
                '05.6': createNode('G-05.6', '05.6 Despesa com Socios', 1),
                '05.7': createNode('G-05.7', '05.7 Serviços Contratados', 1),
                '05.8': createNode('G-05.8', '05.8 Despesa Comercial/Marketing', 1),
                '05.9': createNode('G-05.9', '05.9 Despesa com Estrutura', 1),
                '05.10': createNode('G-05.10', '05.10 Despesa Copa e Cozinha', 1),
                '05.11': createNode('G-05.11', '05.11 Despesa com Veículos', 1),
                '05.12': createNode('G-05.12', '05.12 Despesa de Informatica', 1),
                '05.13': createNode('G-05.13', '05.13 Taxas e Despesas Legais', 1),
            };
            despAdmin.children = Object.values(despAdminSubs);

            const ebitda = createNode('F-EBITDA', '(=) EBITDA', 0, true);

            const despFin = createNode('G-06', '06. Despesas Financeiras', 0);
            const despFinSubs: Record<string, any> = {
                '06.1': createNode('G-06.1', '06.1 Entradas Financeiras', 1),
                '06.2': createNode('G-06.2', '06.2 Saidas Financeiras', 1),
                '06.3': createNode('G-06.3', '06.3 Financiamento', 1),
                '06.4': createNode('G-06.4', '06.4 Juros/Multas', 1),
                '06.5': createNode('G-06.5', '06.5 Passivo Trabalhista', 1),
                '06.6': createNode('G-06.6', '06.6 Depreciação', 1),
                '06.7': createNode('G-06.7', '06.7 Cartão de Credito', 1),
                '06.8': createNode('G-06.8', '06.8 PDD', 1),
            };
            despFin.children = Object.values(despFinSubs);

            const lucroLiquido = createNode('F-LL', '(=) LUCRO LÍQUIDO', 0, true);

            const invest = createNode('G-07', '07. Investimentos', 0);

            flatData.forEach(cat => {
                const name = cat.categoryName;
                const codeMatch = name.match(/^([\d.]+)/);
                const code = codeMatch ? codeMatch[1] : '';

                const parts = code.split('.');
                if (parts.length >= 2 || code.startsWith('07') || code.startsWith('7')) {
                    const subPrefix = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : code;
                    
                    // Skip if this node is exactly the parent prefix to avoid duplicates
                    if (parts.length >= 2 && code === subPrefix) return;

                    let parentNode = null;
                    if (code.startsWith('01.1.') || code.startsWith('1.1.')) {
                        parentNode = recServicos;
                    } else if (code.startsWith('01.2.') || code.startsWith('1.2.')) {
                        parentNode = recVendas;
                    } else if (code.startsWith('02.1.') || code.startsWith('2.1.') || code.startsWith('02.') || code.startsWith('2.')) {
                        parentNode = tribSub;
                    } else if (code.startsWith('03.')) {
                        parentNode = custosSubs[subPrefix];
                    } else if (code.startsWith('04.')) {
                        parentNode = despVendasSubs[subPrefix];
                    } else if (code.startsWith('05.')) {
                        parentNode = despAdminSubs[subPrefix];
                    } else if (code.startsWith('06.')) {
                        parentNode = despFinSubs[subPrefix];
                    } else if (code.startsWith('07.') || code.startsWith('7.')) {
                        parentNode = invest;
                    }

                    if (parentNode) {
                        parentNode.children.push({
                            ...cat,
                            level: parentNode.level + 1,
                            isFormula: false,
                            children: []
                        });
                    }
                }
            });

            // Sort children by code prefix
            const sortChildrenByCode = (node: any) => {
                if (node.children && node.children.length > 0) {
                    node.children.sort((a: any, b: any) => {
                        const aCodeMatch = a.categoryName.match(/^([\d.]+)/);
                        const bCodeMatch = b.categoryName.match(/^([\d.]+)/);
                        const aCode = aCodeMatch ? aCodeMatch[1] : a.categoryName;
                        const bCode = bCodeMatch ? bCodeMatch[1] : b.categoryName;
                        return aCode.localeCompare(bCode, undefined, { numeric: true, sensitivity: 'base' });
                    });
                    node.children.forEach(sortChildrenByCode);
                }
            };

            [recBruta, tributos, custosOp, despVendas, despAdmin, despFin, invest].forEach(sortChildrenByCode);

            // Compute parent sums
            const computeSums = (node: any): any => {
                if (!node.children || node.children.length === 0) {
                    return { realized: node.realized, budget: node.budget, forecast: node.forecast };
                }

                node.children.forEach((child: any) => {
                    const childData = computeSums(child);
                    const isFinancialRevenue = child.categoryId.includes('06.1') || child.categoryName.includes('06.1');
                    const sign = isFinancialRevenue ? -1 : 1;
                    for (let i = 0; i < 12; i++) {
                        node.realized[i] += sign * childData.realized[i];
                        node.budget[i] += sign * childData.budget[i];
                        node.forecast[i] += sign * childData.forecast[i];
                    }
                });

                return { realized: node.realized, budget: node.budget, forecast: node.forecast };
            };

            computeSums(recBruta);
            computeSums(tributos);
            computeSums(custosOp);
            computeSums(despVendas);
            computeSums(despAdmin);
            computeSums(despFin);
            computeSums(invest);

            // Compute formulas
            for (let i = 0; i < 12; i++) {
                recLiquida.realized[i] = recBruta.realized[i] - tributos.realized[i];
                recLiquida.budget[i] = recBruta.budget[i] - tributos.budget[i];
                recLiquida.forecast[i] = recBruta.forecast[i] - tributos.forecast[i];

                margemBruta.realized[i] = recLiquida.realized[i] - custosOp.realized[i];
                margemBruta.budget[i] = recLiquida.budget[i] - custosOp.budget[i];
                margemBruta.forecast[i] = recLiquida.forecast[i] - custosOp.forecast[i];

                margemContrib.realized[i] = margemBruta.realized[i] - despVendas.realized[i];
                margemContrib.budget[i] = margemBruta.budget[i] - despVendas.budget[i];
                margemContrib.forecast[i] = margemBruta.forecast[i] - despVendas.forecast[i];

                ebitda.realized[i] = margemContrib.realized[i] - despAdmin.realized[i];
                ebitda.budget[i] = margemContrib.budget[i] - despAdmin.budget[i];
                ebitda.forecast[i] = margemContrib.forecast[i] - despAdmin.forecast[i];

                lucroLiquido.realized[i] = ebitda.realized[i] - despFin.realized[i];
                lucroLiquido.budget[i] = ebitda.budget[i] - despFin.budget[i];
                lucroLiquido.forecast[i] = ebitda.forecast[i] - despFin.forecast[i];
            }

            return [
                recBruta, tributos, recLiquida, custosOp, margemBruta,
                despVendas, margemContrib, despAdmin, ebitda, despFin, lucroLiquido, invest
            ];
        };

        const treeRoots = buildDreTree(forecastData);

        const resultList: any[] = [];
        const checkVisible = (node: any, parentVisible = true) => {
            if (parentVisible) {
                resultList.push(node);
            }
            if (node.children && node.children.length > 0) {
                const isOpen = expandedRows.has(node.categoryId);
                node.children.sort((a: any, b: any) => a.categoryName.localeCompare(b.categoryName));
                node.children.forEach((c: any) => checkVisible(c, parentVisible && isOpen));
            }
        };

        treeRoots.forEach(r => checkVisible(r, true));
        return resultList;
    }, [forecastData, expandedRows]);

    const renderTabContent = () => {
        if (loadingData) {
            return (
                                    <div style={{ padding: '4rem', display: 'flex', justifyContent: 'center' }}>
                                        <div style={{ border: '3px solid var(--border-default)', borderTopColor: 'var(--accent-indigo)', borderRadius: '50%', width: '36px', height: '36px', animation: 'spin 1s linear infinite' }} />
                                    </div>
            );
        }

        if (activeTab === 'grid') {
            return (
                                    <div className="glass-card" style={{ padding: '1.25rem', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-default)', overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '2px solid var(--border-default)', color: 'var(--text-secondary)' }}>
                                                    <th style={{ padding: '0.5rem', minWidth: '180px' }}>Conta - Categoria</th>
                                                    {monthsName.map((name, i) => (
                                                        <React.Fragment key={i}>
                                                            <th style={{ padding: '0.5rem', textAlign: 'right', minWidth: '100px', whiteSpace: 'nowrap', background: i + 1 <= activeMonth ? 'rgba(99, 102, 241, 0.05)' : 'transparent' }}>
                                                                {name} <span style={{ fontSize: '0.6rem', display: 'block', opacity: 0.7 }}>{i + 1 <= activeMonth ? 'Real' : 'Proj'}</span>
                                                            </th>
                                                            {showAV && (
                                                                <th style={{ padding: '0.5rem', textAlign: 'center', width: '55px', minWidth: '55px', background: i + 1 <= activeMonth ? 'rgba(99, 102, 241, 0.03)' : 'transparent', color: 'var(--text-secondary)', fontSize: '0.65rem' }}>
                                                                    AV
                                                                </th>
                                                            )}
                                                        </React.Fragment>
                                                    ))}
                                                    <th style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 800, minWidth: '110px', whiteSpace: 'nowrap' }}>Total Forecast</th>
                                                    {showAV && <th style={{ padding: '0.5rem', textAlign: 'center', width: '55px', minWidth: '55px', color: 'var(--text-secondary)', fontSize: '0.65rem' }}>AV</th>}
                                                    <th style={{ padding: '0.5rem', textAlign: 'right', opacity: 0.8, minWidth: '110px', whiteSpace: 'nowrap' }}>Budget Original</th>
                                                    {showAV && <th style={{ padding: '0.5rem', textAlign: 'center', width: '55px', minWidth: '55px', color: 'var(--text-secondary)', opacity: 0.8, fontSize: '0.65rem' }}>AV</th>}
                                                    <th style={{ padding: '0.5rem', textAlign: 'right', minWidth: '110px', whiteSpace: 'nowrap' }}>Variação</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {displayGrid.map(row => {
                                                    const sumForecast = row.forecast.reduce((a: number, b: number) => a + b, 0);
                                                    const sumBudget = row.budget.reduce((a: number, b: number) => a + b, 0);
                                                    const variance = sumForecast - sumBudget;
                                                    
                                                    // Análise Vertical (AV) Totais
                                                    const groupBruta = displayGrid.find(r => r.categoryId === 'G-01');
                                                    const sumForecastBruta = groupBruta?.forecast.reduce((a: number, b: number) => a + b, 0) || 0;
                                                    const sumBudgetBruta = groupBruta?.budget.reduce((a: number, b: number) => a + b, 0) || 0;
                                                    const avTotalPercent = Math.abs(sumForecastBruta) > 0.01 ? (sumForecast / sumForecastBruta) * 100 : 0;
                                                    const avBudgetPercent = Math.abs(sumBudgetBruta) > 0.01 ? (sumBudget / sumBudgetBruta) * 100 : 0;
                                                    
                                                    const isGroup = row.categoryId.startsWith('G-');
                                                    const isFormula = row.categoryId.startsWith('F-');
                                                    const hasChildren = row.children && row.children.length > 0;
            
                                                    let background = 'transparent';
                                                    let fontWeight = 500;
                                                    let borderBottom = '1px solid var(--border-subtle)';
            
                                                    if (isFormula) {
                                                        background = 'rgba(99, 102, 241, 0.08)';
                                                        fontWeight = 800;
                                                        borderBottom = '2px double var(--border-default)';
                                                    } else if (isGroup) {
                                                        background = 'var(--bg-elevated)';
                                                        fontWeight = 700;
                                                    }
            
                                                    return (
                                                        <tr key={row.categoryId} style={{ borderBottom, background, fontWeight }}>
                                                            <td style={{ padding: '0.6rem 0.5rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', paddingLeft: `${row.level * 16 + 8}px` }}>
                                                                {hasChildren && (
                                                                    <span 
                                                                        onClick={() => toggleRow(row.categoryId)}
                                                                        style={{ cursor: 'pointer', userSelect: 'none', marginRight: '0.5rem', display: 'inline-block', width: '12px', color: 'var(--text-secondary)' }}
                                                                    >
                                                                         {expandedRows.has(row.categoryId) ? '▼' : '▶'}
                                                                    </span>
                                                                )}
                                                                {!hasChildren && !isFormula && <span style={{ display: 'inline-block', width: '17px' }} />}
                                                                <span 
                                                                    onClick={() => hasChildren && toggleRow(row.categoryId)}
                                                                    style={{ cursor: hasChildren ? 'pointer' : 'default' }}
                                                                >
                                                                    {row.categoryName}
                                                                </span>
                                                            </td>
                                                            {row.forecast.map((val: number, i: number) => {
                                                                const totalBruta = displayGrid.find(r => r.categoryId === 'G-01')?.forecast[i] || 0;
                                                                const avPercent = Math.abs(totalBruta) > 0.01 ? (val / totalBruta) * 100 : 0;
                                                                return (
                                                                    <React.Fragment key={i}>
                                                                        <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                                            {fmt(val)}
                                                                        </td>
                                                                        {showAV && (
                                                                            <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.7rem', fontWeight: 600 }}>
                                                                                {avPercent.toFixed(1)}%
                                                                            </td>
                                                                        )}
                                                                    </React.Fragment>
                                                                );
                                                            })}
                                                            <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontWeight: 800, color: 'var(--accent-indigo)', whiteSpace: 'nowrap' }}>
                                                                {fmt(sumForecast)}
                                                            </td>
                                                            {showAV && (
                                                                <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.7rem', fontWeight: 700 }}>
                                                                    {avTotalPercent.toFixed(1)}%
                                                                </td>
                                                            )}
                                                            <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', opacity: 0.8, whiteSpace: 'nowrap' }}>
                                                                {fmt(sumBudget)}
                                                            </td>
                                                            {showAV && (
                                                                <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.7rem', fontWeight: 700, opacity: 0.8 }}>
                                                                    {avBudgetPercent.toFixed(1)}%
                                                                </td>
                                                            )}
                                                            <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', color: variance > 0 ? 'var(--accent-green)' : variance < 0 ? 'var(--accent-red)' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                                                {variance > 0 ? '+' : ''}{fmt(variance)}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
            );
        }

        if (activeTab === 'coefficients') {
            return (
                                    <div className="glass-card" style={{ padding: '1.25rem', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>Configuração de Percentuais (Análise Vertical)</h4>
                                                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                    Defina a porcentagem de cada subcategoria operacional em relação à Receita Bruta. Esses pesos serão multiplicados pelas vendas projetadas no simulador de contratos.
                                                </p>
                                                {selectedTenant === 'ALL' && (
                                                    <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--accent-orange)', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                                                        ⚠️ Você está na visualização Consolidada. Alterações aqui serão aplicadas a todas as empresas do grupo.
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button 
                                                    onClick={() => setExpandedContractRows(new Set(['G-01', 'G-02', 'G-03', 'G-01.1', 'G-01.2', 'G-02.1', 'G-03.1', 'G-03.2', 'G-03.3', 'G-03.4', 'G-03.5', 'G-03.6', 'G-03.7', 'G-03.8', 'G-03.9', 'G-03.10']))}
                                                    className="btn" 
                                                    style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: 700, padding: '0.35rem 0.75rem', borderRadius: '6px', cursor: 'pointer', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                                                >
                                                    ↕️ Expandir Tudo
                                                </button>
                                                <button 
                                                    onClick={() => setExpandedContractRows(new Set())}
                                                    className="btn" 
                                                    style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: 700, padding: '0.35rem 0.75rem', borderRadius: '6px', cursor: 'pointer', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                                                >
                                                    ↔️ Retrair Tudo
                                                </button>
                                            </div>
                                        </div>
            
                                        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.25rem' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                                                <thead>
                                                    <tr style={{ borderBottom: '2px solid var(--border-default)', color: 'var(--text-secondary)' }}>
                                                        <th style={{ padding: '0.5rem' }}>Conta - Categoria</th>
                                                        <th style={{ padding: '0.5rem', textAlign: 'center', width: '200px' }}>Percentual (AV % da Receita)</th>
                                                        <th style={{ padding: '0.5rem', textAlign: 'center', width: '220px' }}>Origem da Taxa</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {coefTreeGrid.map(row => {
                                                        const isGroup = row.categoryId.startsWith('G-') || row.isFormula;
                                                        const hasChildren = row.children && row.children.length > 0;
                                                        
                                                        let borderBottom = '1px solid var(--border-subtle)';
                                                        let background = 'transparent';
                                                        let fontWeight = 400;
            
                                                        if (row.categoryId === 'G-02' || row.categoryId === 'G-03') {
                                                            borderBottom = '2px solid var(--border-default)';
                                                            background = 'var(--bg-surface)';
                                                            fontWeight = 800;
                                                        } else if (isGroup) {
                                                            background = 'var(--bg-elevated)';
                                                            fontWeight = 700;
                                                        }
            
                                                        return (
                                                            <tr key={row.categoryId} style={{ borderBottom, background, fontWeight }}>
                                                                <td style={{ padding: '0.55rem 0.5rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', paddingLeft: `${row.level * 16 + 8}px` }}>
                                                                    {hasChildren && (
                                                                        <span 
                                                                            onClick={() => toggleContractRow(row.categoryId)}
                                                                            style={{ cursor: 'pointer', userSelect: 'none', marginRight: '0.5rem', display: 'inline-block', width: '12px', color: 'var(--text-secondary)' }}
                                                                        >
                                                                            {expandedContractRows.has(row.categoryId) ? '▼' : '▶'}
                                                                        </span>
                                                                    )}
                                                                    {!hasChildren && <span style={{ display: 'inline-block', width: '17px' }} />}
                                                                    <span 
                                                                        onClick={() => hasChildren && toggleContractRow(row.categoryId)}
                                                                        style={{ cursor: hasChildren ? 'pointer' : 'default' }}
                                                                    >
                                                                        {row.categoryName}
                                                                    </span>
                                                                </td>
                                                                <td style={{ padding: '0.55rem 0.5rem', textAlign: 'center', width: '200px' }}>
                                                                    {isGroup ? (
                                                                        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent-indigo)' }}>
                                                                            {row.percentage.toFixed(2)}%
                                                                        </span>
                                                                    ) : (
                                                                        editingCoefId === row.categoryId ? (
                                                                            <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', justifyContent: 'center' }}>
                                                                                <input
                                                                                    type="number"
                                                                                    step="0.01"
                                                                                    value={editingCoefValue}
                                                                                    onChange={(e) => setEditingCoefValue(parseFloat(e.target.value) || 0)}
                                                                                    style={{ width: '60px', height: '28px', padding: '0 0.35rem', borderRadius: '4px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.8rem', fontWeight: 700 }}
                                                                                />
                                                                                <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>%</span>
                                                                                <button
                                                                                    onClick={() => handleSaveCoefficientOverride(row.categoryId, editingCoefValue)}
                                                                                    style={{ background: 'var(--accent-green)', color: '#ffffff', border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}
                                                                                >
                                                                                    💾
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => setEditingCoefId(null)}
                                                                                    style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '4px', padding: '2px 6px', fontSize: '0.7rem', cursor: 'pointer', color: 'var(--text-primary)' }}
                                                                                >
                                                                                    ❌
                                                                                </button>
                                                                            </div>
                                                                        ) : (
                                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                                                                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                                                    {row.percentage.toFixed(2)}%
                                                                                </span>
                                                                                <button
                                                                                    onClick={() => {
                                                                                        setEditingCoefId(row.categoryId);
                                                                                        setEditingCoefValue(row.percentage);
                                                                                    }}
                                                                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}
                                                                                >
                                                                                    ✏️
                                                                                </button>
                                                                            </div>
                                                                        )
                                                                    )}
                                                                </td>
                                                                <td style={{ padding: '0.55rem 0.5rem', textAlign: 'center', width: '220px', color: row.isOverride ? 'var(--accent-orange)' : 'var(--text-secondary)' }}>
                                                                    {isGroup ? (
                                                                        <span style={{ fontSize: '0.7rem', fontWeight: 700 }}>📁 Grupo de Contas</span>
                                                                    ) : (
                                                                        row.isOverride ? '⚠️ Valor Personalizado' : '📊 Histórico Calculado'
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
            );
        }

        // activeTab === 'simulator'
        return (
                                    <div className="glass-card" style={{ padding: '1.25rem', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: '1rem', overflowX: 'auto' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>Simulador de Contratos Mensais</h4>
                                                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                    Projete o faturamento mensal de novos contratos e vincule os respectivos vendedores. Os faturamentos e os custos simulados refletirão automaticamente no Forecast.
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    setEditingContractId(null);
                                                    setContractName('');
                                                    setContractValue(0);
                                                    setContractStartMonth(activeMonth + 1 > 12 ? 12 : activeMonth + 1);
                                                    setContractProbability(100);
                                                    setContractStatus('PIPELINE');
                                                    setContractTenantId(companies[0]?.id || '');
                                                    setContractSeller('');
                                                    setContractRevenueSplit({});
                                                    setSelectedRevenueCode('');
                                                    setTypedRevenueValue('');
                                                    setIsContractModalOpen(true);
                                                }}
                                                style={{
                                                    padding: '0.5rem 1rem',
                                                    background: 'var(--gradient-brand)',
                                                    color: '#ffffff',
                                                    border: 'none',
                                                    borderRadius: '8px',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.25rem',
                                                    boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)'
                                                }}
                                            >
                                                ➕ Adicionar Novo Contrato
                                            </button>
                                        </div>
            
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left', minWidth: '1000px' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '2px solid var(--border-default)', color: 'var(--text-secondary)' }}>
                                                    <th style={{ padding: '0.5rem', minWidth: '150px' }}>Contrato - Cliente</th>
                                                    <th style={{ padding: '0.5rem', minWidth: '120px' }}>Vendedor</th>
                                                    <th style={{ padding: '0.5rem', minWidth: '100px', textAlign: 'center' }}>Probabilidade - Status</th>
                                                    {monthsName.map((name, i) => (
                                                        <th key={i} style={{ padding: '0.5rem', textAlign: 'right', minWidth: '85px', background: i + 1 >= activeMonth + 1 ? 'rgba(99, 102, 241, 0.04)' : 'transparent' }}>
                                                            {name}
                                                        </th>
                                                    ))}
                                                    <th style={{ padding: '0.5rem', textAlign: 'center', width: '100px' }}>Ações</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {contracts.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={16} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                                            Nenhum contrato simulado. Clique em "Adicionar Novo Contrato" para iniciar.
                                                        </td>
                                                    </tr>
                                                ) :
                                                    contracts.map(contract => {
                                                        const { name: cleanName, seller: cleanSeller } = parseContractName(contract.name);
                                                        return (
                                                            <tr key={contract.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                                                <td style={{ padding: '0.6rem 0.5rem', fontWeight: 700 }}>
                                                                    {cleanName}
                                                                    {selectedTenant === 'ALL' && (
                                                                        <span style={{ display: 'block', fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                                                            🏢 {contract.tenant?.name}
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td style={{ padding: '0.6rem 0.5rem', color: cleanSeller ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: 600 }}>
                                                                    {cleanSeller || '-'}
                                                                </td>
                                                                <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                                                                    <span style={{
                                                                        fontSize: '0.65rem',
                                                                        fontWeight: 800,
                                                                        padding: '2px 6px',
                                                                        borderRadius: '4px',
                                                                        background: contract.status === 'VENDIDO' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(99, 102, 241, 0.1)',
                                                                        color: contract.status === 'VENDIDO' ? 'var(--accent-green)' : 'var(--accent-indigo)'
                                                                    }}>
                                                                        {contract.status === 'VENDIDO' ? 'VENDIDO' : `${contract.probability}% Prob.`}
                                                                    </span>
                                                                </td>
                                                                {monthsName.map((_, i) => {
                                                                    const monthNum = i + 1;
                                                                    const isActive = monthNum >= contract.startMonth;
                                                                    const multiplier = contract.status === 'VENDIDO' ? 1.0 : (contract.probability * 0.01);
                                                                    const val = isActive ? contract.value * multiplier : 0;
                                                                    
                                                                    return (
                                                                        <td key={i} style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontWeight: isActive ? 700 : 400, color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)', background: monthNum >= activeMonth + 1 ? 'rgba(99, 102, 241, 0.02)' : 'transparent' }}>
                                                                            {val > 0 ? fmt(val) : '-'}
                                                                        </td>
                                                                    );
                                                                })}
                                                                <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                                                                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                                                                        <button
                                                                            onClick={() => setViewingContractDetails(contract)}
                                                                            title="Visualizar Custos DRE do Contrato"
                                                                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}
                                                                        >
                                                                            👁️
                                                                        </button>
                                                                        <button
                                                                            onClick={() => {
                                                                                const { name: nameOnly, split: splitObj, seller: sellerStr } = parseContractName(contract.name);
                                                                                setEditingContractId(contract.id);
                                                                                setContractName(nameOnly);
                                                                                setContractValue(contract.value);
                                                                                setContractStartMonth(contract.startMonth);
                                                                                setContractProbability(contract.probability);
                                                                                setContractStatus(contract.status);
                                                                                setContractTenantId(contract.tenantId);
                                                                                setContractSeller(sellerStr);
                                                                                setContractRevenueSplit(splitObj);
                                                                                setIsContractModalOpen(true);
                                                                            }}
                                                                            title="Editar Contrato"
                                                                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}
                                                                        >
                                                                            ✏️
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleDeleteContract(contract.id)}
                                                                            title="Excluir Contrato"
                                                                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}
                                                                        >
                                                                            🗑️
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                }
                                                {contracts.length > 0 && (
                                                    <tr style={{ borderTop: '2px solid var(--border-default)', background: 'var(--bg-elevated)', fontWeight: 800 }}>
                                                        <td colSpan={3} style={{ padding: '0.65rem 0.5rem' }}>
                                                            Total Receita Simulada
                                                        </td>
                                                        {monthsName.map((_, i) => {
                                                            const monthNum = i + 1;
                                                            const totalMonthVal = contracts.reduce((sum, contract) => {
                                                                const isVal = monthNum >= contract.startMonth;
                                                                const multiplier = contract.status === 'VENDIDO' ? 1.0 : (contract.probability * 0.01);
                                                                return sum + (isVal ? contract.value * multiplier : 0);
                                                            }, 0);
                                                            
                                                            return (
                                                                <td key={i} style={{ padding: '0.65rem 0.5rem', textAlign: 'right', color: 'var(--accent-indigo)' }}>
                                                                    {totalMonthVal > 0 ? fmt(totalMonthVal) : '-'}
                                                                </td>
                                                            );
                                                        })}
                                                        <td></td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
        );
    };

    return (
        <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', boxSizing: 'border-box', background: 'var(--bg-default)', color: 'var(--text-primary)' }}>
            
            {/* Header / Selectors */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>🔮 Projeção Forecast</h2>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Acompanhe o realizado consolidado e simule novos contratos para os meses restantes.</span>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {/* Company selector */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Empresa</span>
                        <select
                            value={selectedTenant}
                            onChange={(e) => {
                                setSelectedTenant(e.target.value);
                                localStorage.setItem('selectedTenantId', e.target.value);
                            }}
                            style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: 600 }}
                        >
                            <option value="ALL">Todas Empresas (Consolidado)</option>
                            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>

                    {/* Year Selector */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Ano</span>
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                            style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: 600 }}
                        >
                            {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>

                    {/* Active Month (Corte Realizado) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Corte de Realizado (Mês)</span>
                        <select
                            value={activeMonth}
                            onChange={(e) => setActiveMonth(parseInt(e.target.value))}
                            style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: 600 }}
                        >
                            {monthsName.map((name, i) => <option key={i} value={i + 1}>{name} (Realizado até {name})</option>)}
                        </select>
                    </div>

                    {/* Simulator Modal Trigger Button */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'transparent', textTransform: 'uppercase', userSelect: 'none' }}>Simulador</span>
                        <button
                            onClick={() => setActiveTab('simulator')}
                            style={{
                                height: '36px',
                                padding: '0 1rem',
                                borderRadius: '8px',
                                border: 'none',
                                background: 'var(--gradient-brand)',
                                color: '#ffffff',
                                fontWeight: 700,
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)'
                            }}
                        >
                            🚀 Simulador ({contracts.length})
                        </button>
                    </div>
                </div>
            </div>

            {/* Layout Main Grid */}
            <div style={{ display: 'flex', width: '100%' }}>
                
                {/* Data Grid and Tabs (Full Width) */}
                <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    
                    {/* Tabs */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-default)', paddingBottom: '0.5rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                onClick={() => setActiveTab('grid')}
                                style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', background: activeTab === 'grid' ? 'var(--accent-indigo)' : 'transparent', color: activeTab === 'grid' ? '#ffffff' : 'var(--text-secondary)', fontWeight: 700, cursor: 'pointer' }}
                            >
                                📊 Planilha Forecast (DRE)
                            </button>
                            <button
                                onClick={() => setActiveTab('coefficients')}
                                style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', background: activeTab === 'coefficients' ? 'var(--accent-indigo)' : 'transparent', color: activeTab === 'coefficients' ? '#ffffff' : 'var(--text-secondary)', fontWeight: 700, cursor: 'pointer' }}
                            >
                                ⚙️ Coeficientes de Custos (Análise Vertical)
                            </button>
                            <button
                                onClick={() => setActiveTab('simulator')}
                                style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', background: activeTab === 'simulator' ? 'var(--accent-indigo)' : 'transparent', color: activeTab === 'simulator' ? '#ffffff' : 'var(--text-secondary)', fontWeight: 700, cursor: 'pointer' }}
                            >
                                🚀 Simulador de Contratos ({contracts.length})
                            </button>
                        </div>
                        {activeTab === 'grid' && (
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <button
                                    onClick={handleExpandAll}
                                    style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                                >
                                    ↕️ Expandir Tudo
                                </button>
                                <button
                                    onClick={handleCollapseAll}
                                    style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                                >
                                    ↔️ Retrair Tudo
                                </button>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 700, color: 'var(--text-primary)', padding: '0.35rem 0.65rem', background: 'var(--bg-elevated)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                                    <input 
                                        type="checkbox" 
                                        checked={showAV} 
                                        onChange={(e) => setShowAV(e.target.checked)} 
                                        style={{ cursor: 'pointer' }}
                                    />
                                    🔍 Exibir Análise Vertical (AV)
                                </label>
                            </div>
                        )}
                    </div>

                    {renderTabContent()}
                </div>
            </div>



            {/* Contract Modal */}
            {isContractModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 20000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div className="glass-card" style={{ width: '380px', padding: '1.5rem', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>{editingContractId ? '✏️ Editar Contrato' : '➕ Novo Contrato de Simulação'}</h4>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                            {selectedTenant === 'ALL' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Empresa Destino</label>
                                    <select
                                        value={contractTenantId}
                                        onChange={(e) => setContractTenantId(e.target.value)}
                                        style={{ height: '36px', padding: '0 0.5rem', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                                    >
                                        {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Nome do Cliente / Oportunidade</label>
                                <input
                                    type="text"
                                    value={contractName}
                                    onChange={(e) => setContractName(e.target.value)}
                                    placeholder="Ex: Novo Cliente Alfa"
                                    style={{ height: '36px', padding: '0 0.5rem', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                                />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Vendedor</label>
                                <input
                                    type="text"
                                    value={contractSeller}
                                    onChange={(e) => setContractSeller(e.target.value)}
                                    placeholder="Ex: Carlos Silva"
                                    style={{ height: '36px', padding: '0 0.5rem', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                                />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Valor Mensal Total (Soma das Contas)</label>
                                <input
                                    type="text"
                                    readOnly
                                    value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(contractValue)}
                                    style={{ height: '36px', padding: '0 0.5rem', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--accent-indigo)', fontWeight: 800, fontSize: '0.85rem' }}
                                />
                            </div>

                            {/* Revenue Accounts Selection dropdown and input */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.6rem' }}>
                                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                                    Adicionar Receita por Conta
                                </label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                                    <select
                                        value={selectedRevenueCode}
                                        onChange={(e) => setSelectedRevenueCode(e.target.value)}
                                        style={{ height: '36px', padding: '0 0.5rem', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.75rem' }}
                                    >
                                        <option value="">-- Selecione a Conta de Receita --</option>
                                        {revenueCategories.map(cat => {
                                            const codeMatch = cat.categoryName.match(/^([\d.]+)/);
                                            const code = codeMatch ? codeMatch[1] : '';
                                            return <option key={cat.categoryId} value={code}>{cat.categoryName}</option>;
                                        })}
                                    </select>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <input
                                            type="text"
                                            placeholder="R$ 0,00"
                                            value={typedRevenueValue}
                                            onChange={(e) => {
                                                const formatted = formatCurrencyInput(e.target.value);
                                                setTypedRevenueValue(formatted);
                                            }}
                                            style={{ flex: 1, height: '36px', padding: '0 0.5rem', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.75rem', fontWeight: 700 }}
                                        />
                                        <button
                                            type="button"
                                            onClick={handleAddRevenue}
                                            style={{ padding: '0 1rem', borderRadius: '6px', border: 'none', background: 'var(--accent-indigo)', color: '#ffffff', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}
                                        >
                                            Adicionar
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* List of Added Revenues in Contract */}
                            {Object.entries(contractRevenueSplit).filter(([_, val]) => val > 0).length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                                        Contas Lançadas no Contrato
                                    </label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '110px', overflowY: 'auto', padding: '0.4rem', background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                                        {Object.entries(contractRevenueSplit)
                                            .filter(([_, val]) => val > 0)
                                            .map(([code, val]) => {
                                                const cat = revenueCategories.find(c => c.categoryName.startsWith(code));
                                                const name = cat ? cat.categoryName : `${code} - Receita`;
                                                return (
                                                    <div key={code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                                                        <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }} title={name}>
                                                            {name}
                                                        </span>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-indigo)' }}>
                                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveRevenue(code)}
                                                                style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}
                                                                title="Excluir"
                                                            >
                                                                🗑️
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Mês de Início</label>
                                    <select
                                        value={contractStartMonth}
                                        onChange={(e) => setContractStartMonth(parseInt(e.target.value))}
                                        style={{ height: '36px', padding: '0 0.5rem', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                                    >
                                        {monthsName.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
                                    </select>
                                </div>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Status</label>
                                    <select
                                        value={contractStatus}
                                        onChange={(e) => {
                                            setContractStatus(e.target.value);
                                            if (e.target.value === 'VENDIDO') setContractProbability(100);
                                        }}
                                        style={{ height: '36px', padding: '0 0.5rem', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                                    >
                                        <option value="PIPELINE">Pipeline / Em Negoc.</option>
                                        <option value="VENDIDO">VENDIDO (Ganho)</option>
                                    </select>
                                </div>
                            </div>

                            {contractStatus === 'PIPELINE' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Probabilidade de Fechamento: {contractProbability}%</label>
                                    <input
                                        type="range"
                                        min="10"
                                        max="100"
                                        step="10"
                                        value={contractProbability}
                                        onChange={(e) => setContractProbability(parseInt(e.target.value))}
                                        style={{ accentColor: 'var(--accent-indigo)' }}
                                    />
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                            <button
                                onClick={() => setIsContractModalOpen(false)}
                                style={{ padding: '0.45rem 1rem', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 700 }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveContract}
                                style={{ padding: '0.45rem 1rem', borderRadius: '6px', border: 'none', background: 'var(--accent-indigo)', color: '#ffffff', cursor: 'pointer', fontWeight: 700 }}
                            >
                                Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {viewingContractDetails && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 20000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div className="glass-card" style={{ width: '700px', maxHeight: '85vh', padding: '1.5rem', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    📊 Detalhamento de Custos Mensais
                                </h4>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                    Contrato: <strong>{viewingContractDetails.name.includes(' |__SPLIT__:') ? viewingContractDetails.name.substring(0, viewingContractDetails.name.indexOf(' |__SPLIT__:')) : viewingContractDetails.name}</strong> ({viewingContractDetails.tenant?.name || 'Empresa'})
                                </span>
                            </div>
                            <button
                                onClick={() => setViewingContractDetails(null)}
                                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 700 }}
                            >
                                ❌
                            </button>
                        </div>

                        {/* Summary Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                            <div style={{ padding: '0.75rem', background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 700 }}>VALOR BRUTO</span>
                                <span style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--accent-indigo)' }}>{fmt(viewingContractDetails.value)}/mês</span>
                            </div>
                            <div style={{ padding: '0.75rem', background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 700 }}>
                                    IMPOSTOS ({Math.abs(contractDreGrid.find(row => row.categoryId === 'G-02.1')?.av || 0).toFixed(1)}%)
                                </span>
                                <span style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--accent-red)' }}>
                                    {fmt(Math.abs(contractDreGrid.find(row => row.categoryId === 'G-02.1')?.value || 0))}/mês
                                </span>
                            </div>
                            <div style={{ padding: '0.75rem', background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 700 }}>MARGEM BRUTA SIMULADA</span>
                                <span style={{
                                    fontSize: '1.15rem',
                                    fontWeight: 800,
                                    color: (contractDreGrid.find(row => row.categoryId === 'F-MB')?.value || 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'
                                }}>
                                    {fmt(contractDreGrid.find(row => row.categoryId === 'F-MB')?.value || 0)}/mês
                                </span>
                            </div>
                        </div>

                        {/* Table */}
                        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.25rem' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--border-default)', color: 'var(--text-secondary)' }}>
                                        <th style={{ padding: '0.5rem' }}>Conta - Categoria</th>
                                        <th style={{ padding: '0.5rem', textAlign: 'right', width: '150px' }}>Valor Mensal</th>
                                        <th style={{ padding: '0.5rem', textAlign: 'center', width: '150px' }}>Análise Vertical (AV)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {contractDreGrid.map(row => {
                                        const isGroup = row.categoryId.startsWith('G-');
                                        const isFormula = row.categoryId.startsWith('F-');
                                        const hasChildren = row.children && row.children.length > 0;

                                        let background = 'transparent';
                                        let fontWeight = 500;
                                        let borderBottom = '1px solid var(--border-subtle)';

                                        if (isFormula) {
                                            background = 'rgba(99, 102, 241, 0.08)';
                                            fontWeight = 800;
                                            borderBottom = '2px double var(--border-default)';
                                        } else if (isGroup) {
                                            background = 'var(--bg-elevated)';
                                            fontWeight = 700;
                                        }

                                        return (
                                            <tr key={row.categoryId} style={{ borderBottom, background, fontWeight }}>
                                                <td style={{ padding: '0.55rem 0.5rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', paddingLeft: `${row.level * 16 + 8}px` }}>
                                                    {hasChildren && (
                                                        <span 
                                                            onClick={() => toggleContractRow(row.categoryId)}
                                                            style={{ cursor: 'pointer', userSelect: 'none', marginRight: '0.5rem', display: 'inline-block', width: '12px', color: 'var(--text-secondary)' }}
                                                        >
                                                            {expandedContractRows.has(row.categoryId) ? '▼' : '▶'}
                                                        </span>
                                                    )}
                                                    {!hasChildren && !isFormula && <span style={{ display: 'inline-block', width: '17px' }} />}
                                                    <span 
                                                        onClick={() => hasChildren && toggleContractRow(row.categoryId)}
                                                        style={{ cursor: hasChildren ? 'pointer' : 'default' }}
                                                    >
                                                        {row.categoryName}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                                                    {fmt(Math.abs(row.value))}
                                                </td>
                                                <td style={{ padding: '0.55rem 0.5rem', textAlign: 'center', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                    {Math.abs(row.av).toFixed(1)}%
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' }}>
                            <button
                                onClick={() => setViewingContractDetails(null)}
                                className="btn"
                                style={{ padding: '0.45rem 1.25rem', fontSize: '0.8rem', borderRadius: '8px', cursor: 'pointer', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', fontWeight: 700 }}
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
