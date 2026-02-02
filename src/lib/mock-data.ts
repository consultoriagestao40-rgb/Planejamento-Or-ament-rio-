export interface Category {
    id: string;
    name: string;
    level: number;
    parentId?: string;
}

export const MOCK_CATEGORIES: Category[] = [
    { id: '1', name: 'Receitas', level: 1 },
    { id: '1.1', name: 'Vendas de Produtos', level: 2, parentId: '1' },
    { id: '1.2', name: 'Vendas de Serviços', level: 2, parentId: '1' },
    { id: '2', name: 'Despesas Variáveis', level: 1 },
    { id: '2.1', name: 'Impostos', level: 2, parentId: '2' },
    { id: '2.2', name: 'Comissões', level: 2, parentId: '2' },
    { id: '3', name: 'Despesas Fixas', level: 1 },
    { id: '3.1', name: 'Pessoal', level: 2, parentId: '3' },
    { id: '3.1.1', name: 'Salários', level: 3, parentId: '3.1' },
    { id: '3.1.2', name: 'Benefícios', level: 3, parentId: '3.1' },
    { id: '3.2', name: 'Administrativo', level: 2, parentId: '3' },
    { id: '3.2.1', name: 'Aluguel', level: 3, parentId: '3.2' },
    { id: '3.2.2', name: 'Energia', level: 3, parentId: '3.2' },
];

export const MOCK_COST_CENTERS = [
    { id: 'DEFAULT', name: 'Geral (Sem Centro de Custo)' },
    { id: 'CC1', name: 'Comercial' },
    { id: 'CC2', name: 'Administrativo' },
    { id: 'CC3', name: 'Operacional' },
];

export const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
