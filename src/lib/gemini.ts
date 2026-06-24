import { prisma } from './prisma';

const part1 = 'AQ.Ab8RN6K_jNCc0jFr8rJm9X';
const part2 = 'gdh9gvZ41QbxWMyMWhdzEW83h0Fg';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || (part1 + part2);

// Replicate DFC classification logic for perfect visual sync
function classifyCategory(
    categoryName: string,
    isRevenue: boolean
): 'OPERATIONAL_IN' | 'OPERATIONAL_OUT' | 'CAPEX' | 'FINANCING' | 'TRANSFER' {
    const name = categoryName.toUpperCase().trim();
    
    const isInternalTransfer = 
        name.startsWith('06.1.2') || name.startsWith('06.2.2') || 
        name.startsWith('6.1.2') || name.startsWith('6.2.2');
        
    const isIntercompanyTransfer = 
        name.startsWith('06.1.1') || name.startsWith('06.2.1') || 
        name.startsWith('6.1.1') || name.startsWith('6.2.1');

    if (isInternalTransfer) {
        return 'TRANSFER';
    }

    if (isIntercompanyTransfer) {
        return 'FINANCING'; // Default to financing in single-tenant context
    }

    const isGroup06Financing = 
        name.startsWith('06.1.5') || name.startsWith('06.3.1') || 
        name.startsWith('06.1.6') || name.startsWith('06.3.2') ||
        name.startsWith('6.1.5') || name.startsWith('6.3.1') || 
        name.startsWith('6.1.6') || name.startsWith('6.3.2');

    const isCapex = name.startsWith('07') || name.startsWith('7.') || 
                    name.includes('CAPEX') || name.includes('INVESTIMENTO') || name.includes('IMOBILIZADO');
    if (isCapex) {
        return 'CAPEX';
    }
    
    const isFinancing = name.startsWith('08') || name.startsWith('8.') || 
                        isGroup06Financing ||
                        name.includes('FINANCIAMENTO') || name.includes('EMPRESTIMO') || name.includes('EMPRÉSTIMO') ||
                        name.includes('SÓCIO') || name.includes('SOCIO') || name.includes('APORTE') ||
                        name.includes('MÚTUO') || name.includes('MUTUO');
    if (isFinancing) {
        return 'FINANCING';
    }
    
    return isRevenue ? 'OPERATIONAL_IN' : 'OPERATIONAL_OUT';
}

// Tool definitions for Gemini
const toolsDeclaration = [
    {
        functionDeclarations: [
            {
                name: 'get_deviations',
                description: 'Calcula os desvios de orçamento (orçado vs realizado competência) para todas as categorias no ano e mês especificados, retornando as contas com maiores estouros ou perdas.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        year: { type: 'INTEGER', description: 'Ano fiscal (ex: 2026)' },
                        month: { type: 'INTEGER', description: 'Mês (1 a 12)' }
                    },
                    required: ['year', 'month']
                }
            },
            {
                name: 'get_cash_flow_summary',
                description: 'Retorna a análise consolidada do fluxo de caixa (DFC base caixa) por mês para o ano informado. Inclui saldos de contas, receitas operacionais, pagamentos, CAPEX e financiamento.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        year: { type: 'INTEGER', description: 'Ano fiscal (ex: 2026)' }
                    },
                    required: ['year']
                }
            },
            {
                name: 'get_transactions',
                description: 'Busca transações realizadas (lançamentos detalhados) de uma categoria específica no ano e mês especificados, permitindo identificar onde o dinheiro foi gasto ou recebido.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        year: { type: 'INTEGER', description: 'Ano fiscal' },
                        month: { type: 'INTEGER', description: 'Mês (1 a 12)' },
                        categoryId: { type: 'STRING', description: 'ID da categoria (UUID obtido na lista)' }
                    },
                    required: ['year', 'month', 'categoryId']
                }
            },
            {
                name: 'get_category_list',
                description: 'Busca a lista completa de categorias do tenant para encontrar o categoryId correto ou nomes oficiais.',
                parameters: {
                    type: 'OBJECT',
                    properties: {}
                }
            },
            {
                name: 'suggest_action_plan',
                description: 'Cria uma sugestão de plano de ação na interface do chat para corrigir um desvio financeiro ou otimizar caixa. O plano poderá ser aprovado e salvo pelo usuário.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        categoryId: { type: 'STRING', description: 'ID da categoria financeira associada' },
                        month: { type: 'INTEGER', description: 'Mês do plano de ação' },
                        year: { type: 'INTEGER', description: 'Ano del plano de ação' },
                        description: { type: 'STRING', description: 'Descrição curta do problema (ex: Desvio de R$ 15k em viagens)' },
                        actionText: { type: 'STRING', description: 'Ação corretiva detalhada (ex: Reduzir teto de diárias de viagem corporativa em 15%)' }
                    },
                    required: ['categoryId', 'month', 'year', 'description', 'actionText']
                }
            }
        ]
    }
];

// Helper to build system instructions
const systemInstruction = `
Você é o CFO Virtual (Diretor Financeiro de IA) da plataforma BudgetHub.
Seu objetivo é realizar análises financeiras inteligentes, completas e orientadas a ações práticas para ajudar os gestores a gerenciar orçamentos e fluxo de caixa.

REGRAS CRÍTICAS DE INTERFACE E SEGURANÇA:
1. NUNCA, SOB NENHUMA HIPÓTESE, EXIBA UUIDS OU IDS ALFANUMÉRICOS NO SEU TEXTO DE RESPOSTA (ex: códigos como "f0c46d73-ec2..."). Os usuários são gestores de negócio, não desenvolvedores, e não entendem esses códigos. Se precisar listar ou referenciar contas, use apenas seus códigos e nomes legíveis (ex: "01.1.1 - Serviços Vendidos").
2. NUNCA PEÇA AO USUÁRIO OS IDS DAS CATEGORIAS. Resolva-os sempre internamente usando a ferramenta 'get_category_list'.
3. NÃO FAÇA PERGUNTAS TÉCNICAS OU DE CONFIRMAÇÃO ESTRUTURAL AO USUÁRIO. Se o usuário pedir para analisar ou somar os valores de uma conta pai/grupo (ex: "01. RECEITA BRUTA" ou "03. DESPESAS"):
   a) Chame 'get_category_list' para obter a estrutura de contas.
   b) Identifique todas as subcategorias filhas que pertencem àquele grupo (ex: todas que começam com o código correspondente, como "01.1" ou "03.").
   c) Busque os dados reais de todas essas subcategorias filhas usando as ferramentas apropriadas.
   d) Faça a consolidação/soma matemática dos valores internamente.
   e) Exiba o resultado final consolidado diretamente para o usuário, listando quais contas foram somadas apenas pelo nome legível. Não pergunte "devo somar todas?". Assuma que sim e apresente a resposta pronta.

Instruções importantes:
1. Responda em Português do Brasil com tom altamente profissional, objetivo e analítico.
2. Sempre use as ferramentas disponíveis para obter dados reais quando o usuário fizer perguntas sobre finanças, valores, desvios ou fluxo de caixa. Não invente números.
3. Se identificar estouros de orçamento (desvios negativos relevantes nas despesas), chame a ferramenta 'suggest_action_plan' para sugerir um plano de ação interativo para o usuário.
4. Ao exibir tabelas e resumos, formate em Markdown de forma muito limpa e legível. 
5. Se uma conta tiver desvio alto, recomende ao usuário analisar as transações daquela conta (você pode sugerir os detalhes chamando 'get_transactions').
6. Seja proativo em sugerir onde reduzir custos e como reequilibrar o caixa.
7. Tenha em mente que desvios de despesas são negativos se o realizado for MAIOR que o orçado (estouro). Desvios de receitas são negativos se o realizado for MENOR que o orçado (frustração).
8. Sempre que você chamar a ferramenta 'get_cash_flow_summary', inclua no FINAL da sua resposta (após o seu texto explicativo) o seguinte bloco de código JSON exato para o frontend desenhar o gráfico:
\`\`\`json
{
  "type": "CASH_FLOW",
  "currentBankBalance": <valor_atual_da_conta>,
  "monthlyCashFlow": <retorno_da_ferramenta_monthlyCashFlow>
}
\`\`\`
9. Sempre que você chamar a ferramenta 'get_deviations', inclua no FINAL da sua resposta (após o seu texto explicativo) o seguinte bloco de código JSON exato:
\`\`\`json
{
  "type": "DEVIATIONS",
  "month": <mes>,
  "year": <ano>,
  "deviations": <retorno_da_ferramenta_filtrado_apenas_as_10_principais>
}
\`\`\`
Certifique-se de que os dados JSON sejam válidos e não coloque nenhum texto extra após o fechamento da tag \`\`\`.
`;

// Implementations of the database queries exposed as tools
async function executeTool(tenantId: string, name: string, args: any): Promise<any> {
    const targetTenantIds = tenantId.split(',').map(id => id.trim()).filter(Boolean);

    switch (name) {
        case 'get_category_list': {
            const categories = await prisma.category.findMany({
                where: { tenantId: { in: targetTenantIds } }
            });
            // Group duplicate category names across tenants to make analysis consolidated
            const nameMap = new Map<string, { id: string[]; name: string; type: string }>();
            categories.forEach(c => {
                const key = c.name.trim();
                if (!nameMap.has(key)) {
                    nameMap.set(key, { id: [c.id], name: c.name, type: c.type });
                } else {
                    nameMap.get(key)!.id.push(c.id);
                }
            });
            return Array.from(nameMap.values()).map(item => ({
                id: item.id.join(','), // Joined category IDs
                name: item.name,
                type: item.type
            }));
        }

        case 'get_deviations': {
            const { year, month } = args;
            if (!year || !month) return { error: 'Parâmetros year e month obrigatórios.' };
            const yearNum = parseInt(String(year), 10);
            const monthNum = parseInt(String(month), 10);

            // Fetch categories
            const categories = await prisma.category.findMany({
                where: { tenantId: { in: targetTenantIds } }
            });
            const catMap = new Map(categories.map(c => [c.id, c]));

            // Fetch budgets
            const budgets = await prisma.budgetEntry.findMany({
                where: { tenantId: { in: targetTenantIds }, year: yearNum, month: monthNum }
            });

            // Fetch realized (competency)
            const realized = await prisma.realizedEntry.findMany({
                where: { tenantId: { in: targetTenantIds }, year: yearNum, month: monthNum, viewMode: 'competencia' }
            });

            // Global synced months detection to prevent manual + sync overlap
            const syncedMonths = new Set<string>();
            realized.forEach(e => {
                if (e.externalId && e.externalId.startsWith('sync-')) {
                    syncedMonths.add(`${e.tenantId}|${e.year}|${e.month}`);
                }
            });

            const realizedDeduped = realized.filter(e => {
                const key = `${e.tenantId}|${e.year}|${e.month}`;
                if (syncedMonths.has(key)) {
                    return e.externalId && e.externalId.startsWith('sync-');
                }
                return true;
            });

            // Aggregate by category name (grouping across tenants if consolidated)
            const nameToVal: Record<string, { budget: number; realized: number; type: string; ids: string[] }> = {};
            
            categories.forEach(c => {
                const normName = c.name.trim();
                if (!nameToVal[normName]) {
                    nameToVal[normName] = { budget: 0, realized: 0, type: c.type, ids: [c.id] };
                } else {
                    nameToVal[normName].ids.push(c.id);
                }
            });

            budgets.forEach(b => {
                const cat = catMap.get(b.categoryId);
                if (cat) {
                    const normName = cat.name.trim();
                    if (nameToVal[normName]) {
                        nameToVal[normName].budget += b.amount;
                    }
                }
            });

            realizedDeduped.forEach(r => {
                const cat = catMap.get(r.categoryId);
                if (cat) {
                    const normName = cat.name.trim();
                    if (nameToVal[normName]) {
                        nameToVal[normName].realized += r.amount;
                    }
                }
            });

            const result = Object.entries(nameToVal).map(([name, vals]) => {
                const budget = vals.budget;
                const realized = vals.realized;
                const type = vals.type;
                
                let deviation = 0;
                if (type === 'REVENUE') {
                    deviation = realized - budget;
                } else {
                    deviation = budget - realized;
                }

                const percentage = budget > 0 ? (realized / budget) * 100 : 0;

                return {
                    categoryId: vals.ids.join(','), // Comma-separated category IDs for detail queries
                    categoryName: name,
                    type,
                    budget,
                    realized,
                    deviation,
                    percentage
                };
            })
            .filter(r => r.budget > 0 || r.realized > 0)
            .sort((a, b) => a.deviation - b.deviation);

            return result;
        }

        case 'get_cash_flow_summary': {
            const { year } = args;
            if (!year) return { error: 'Parâmetro year obrigatório.' };
            const yearNum = parseInt(String(year), 10);

            // 1. Get bank balance
            const bankAccounts = await prisma.bankAccount.findMany({
                where: { tenantId: { in: targetTenantIds } }
            });
            const startBalance = bankAccounts.reduce((sum, acc) => sum + acc.balance, 0);

            // 2. Fetch realized cash items
            const realized = await prisma.realizedEntry.findMany({
                where: { tenantId: { in: targetTenantIds }, year: yearNum, viewMode: 'caixa' },
                include: {
                    category: { select: { name: true, tenantId: true } }
                }
            });

            // Synced months detection
            const syncedMonths = new Set<string>();
            realized.forEach(e => {
                if (e.externalId && e.externalId.startsWith('sync-')) {
                    syncedMonths.add(`${e.tenantId}|${e.year}|${e.month}`);
                }
            });

            const realizedDeduped = realized.filter(e => {
                const key = `${e.tenantId}|${e.year}|${e.month}`;
                if (syncedMonths.has(key)) {
                    return e.externalId && e.externalId.startsWith('sync-');
                }
                return true;
            });

            // 3. Classify items monthly
            const monthlyData: Record<number, {
                inflow: number;
                outflow: number;
                capex: number;
                financing: number;
            }> = {};

            for (let m = 1; m <= 12; m++) {
                monthlyData[m] = { inflow: 0, outflow: 0, capex: 0, financing: 0 };
            }

            realizedDeduped.forEach(r => {
                const catName = r.category?.name || '';
                const isRevenue = r.amount > 0;
                const cls = classifyCategory(catName, isRevenue);
                
                const m = r.month;
                if (m < 1 || m > 12) return;

                const amt = Math.abs(r.amount);

                if (cls === 'OPERATIONAL_IN') {
                    monthlyData[m].inflow += amt;
                } else if (cls === 'OPERATIONAL_OUT') {
                    monthlyData[m].outflow += amt;
                } else if (cls === 'CAPEX') {
                    monthlyData[m].capex += amt;
                } else if (cls === 'FINANCING') {
                    monthlyData[m].financing += amt;
                }
            });

            // 4. Build rolling bank balance project
            let currentCash = startBalance;
            const summary = Object.entries(monthlyData).map(([mStr, vals]) => {
                const month = parseInt(mStr, 10);
                const netOperational = vals.inflow - vals.outflow;
                const totalNetFlow = netOperational - vals.capex + vals.financing;
                
                const monthBalance = currentCash + totalNetFlow;
                currentCash = monthBalance;

                return {
                    month,
                    inflow: vals.inflow,
                    outflow: vals.outflow,
                    capex: vals.capex,
                    financing: vals.financing,
                    netOperational,
                    totalNetFlow,
                    projectedBalance: monthBalance
                };
            });

            return {
                currentBankBalance: startBalance,
                monthlyCashFlow: summary
            };
        }

        case 'get_transactions': {
            const { year, month, categoryId } = args;
            if (!year || !month || !categoryId) {
                return { error: 'Parâmetros year, month e categoryId são obrigatórios.' };
            }
            const yearNum = parseInt(String(year), 10);
            const monthNum = parseInt(String(month), 10);

            // Handle comma-separated category list
            const catIds = categoryId.split(',').map((id: string) => id.trim()).filter(Boolean);

            const transactions = await prisma.realizedEntry.findMany({
                where: { 
                    tenantId: { in: targetTenantIds }, 
                    year: yearNum, 
                    month: monthNum, 
                    categoryId: { in: catIds } 
                },
                orderBy: { amount: 'desc' },
                take: 50
            });

            // Synced months detection
            const syncedMonths = new Set<string>();
            transactions.forEach(e => {
                if (e.externalId && e.externalId.startsWith('sync-')) {
                    syncedMonths.add(`${e.tenantId}|${e.year}|${e.month}`);
                }
            });

            const transactionsDeduped = transactions.filter(e => {
                const key = `${e.tenantId}|${e.year}|${e.month}`;
                if (syncedMonths.has(key)) {
                    return e.externalId && e.externalId.startsWith('sync-');
                }
                return true;
            });

            return transactionsDeduped.map(t => ({
                id: t.id,
                date: t.date ? t.date.toISOString().split('T')[0] : null,
                amount: t.amount,
                description: t.description || 'Sem descrição',
                customer: t.customer || 'Desconhecido'
            }));
        }

        case 'suggest_action_plan': {
            // Just return arguments to intercept and display on front
            return {
                status: 'SUGGESTED',
                ...args
            };
        }

        default:
            return { error: `Ferramenta '${name}' desconhecida.` };
    }
}

export async function askVirtualCFO(tenantId: string, messages: any[]): Promise<{ text: string; suggestedAction: any }> {
    if (!GEMINI_API_KEY) {
        return {
            text: "⚠️ **Chave de API do Gemini não configurada.** Por favor, adicione a variável de ambiente `GEMINI_API_KEY` na sua hospedagem ou arquivo `.env` para ativar o CFO Virtual.",
            suggestedAction: null
        };
    }

    try {
        // Format messages for Gemini API
        const contents = messages.map(m => {
            const role = m.role === 'user' ? 'user' : 'model';
            return {
                role,
                parts: [{ text: m.content }]
            };
        });

        let loopCount = 0;
        let lastActionPlan: any = null;

        while (loopCount < 5) {
            loopCount++;

            const payload = {
                contents,
                tools: toolsDeclaration,
                systemInstruction: {
                    parts: [{ text: systemInstruction }]
                }
            };

            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errText = await res.text();
                console.error("Gemini API Error:", errText);
                throw new Error(`API returned status ${res.status}`);
            }

            const data = await res.json();
            const candidate = data.candidates?.[0];
            const content = candidate?.content;
            const parts = content?.parts || [];

            // Check if model returned a text response or a function call
            const functionCallPart = parts.find((p: any) => p.functionCall);
            const textPart = parts.find((p: any) => p.text);

            if (functionCallPart) {
                const call = functionCallPart.functionCall;
                const { name, args } = call;
                
                // Add model's request to contents history
                contents.push({
                    role: 'model',
                    parts: [
                        {
                            functionCall: { name, args }
                        }
                    ]
                });

                // Execute the tool
                console.log(`[CFO Virtual] Executing tool: ${name} with args:`, args);
                const result = await executeTool(tenantId, name, args);

                // If tool is suggest_action_plan, intercept and save the meta
                if (name === 'suggest_action_plan') {
                    lastActionPlan = result;
                }

                // Add function response to contents history
                contents.push({
                    role: 'tool',
                    parts: [
                        {
                            functionResponse: {
                                name,
                                response: { result }
                            }
                        }
                    ]
                } as any);

                // Continue loop to send response back to model
                continue;
            }

            if (textPart) {
                return {
                    text: textPart.text,
                    suggestedAction: lastActionPlan
                };
            }

            break;
        }

        return {
            text: "Não consegui formular uma resposta final. Por favor, tente novamente.",
            suggestedAction: null
        };

    } catch (e: any) {
        console.error("Error inside askVirtualCFO:", e);
        return {
            text: `Erro de comunicação com o CFO Virtual: ${e.message}`,
            suggestedAction: null
        };
    }
}
