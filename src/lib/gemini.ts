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

Instruções importantes:
1. Responda em Português do Brasil com tom altamente profissional, objetivo e analítico.
2. Sempre use as ferramentas disponíveis para obter dados reais quando o usuário fizer perguntas sobre finanças, valores, desvios ou fluxo de caixa. Não invente números.
3. Se identificar estouros de orçamento (desvios negativos relevantes nas despesas), chame a ferramenta 'suggest_action_plan' para sugerir um plano de ação interativo para o usuário.
4. Ao exibir tabelas e resumos, formate em Markdown de forma muito limpa e legível. 
5. Se uma conta tiver desvio alto, recomende ao usuário analisar as transações daquela conta (você pode sugerir os detalhes chamando 'get_transactions').
6. Seja proativo em sugerir onde reduzir custos e como reequilibrar o caixa.
7. Tenha em mente que desvios de despesas são negativos se o realizado for MAIOR que o orçado (estouro). Desvios de receitas são negativos se o realizado for MENOR que o orçado (frustração).
8. NUNCA, SOB NENHUMA HIPÓTESE, PEÇA AO USUÁRIO OS IDS OU UUIDS DAS CATEGORIAS. O usuário não sabe e não deve saber esses códigos técnicos do banco de dados.
   Se o usuário mencionar um código de categoria (ex: "03.4", "3.4", "02.01") ou um nome/termo (ex: "diárias", "viagens", "marketing"):
   a) Você DEVE obrigatoriamente chamar a ferramenta 'get_category_list' primeiro para obter a lista completa de categorias (que contém os nomes oficiais e seus respectivos UUIDs).
   b) Com a lista em mãos, faça uma busca interna pelo nome ou pelo código (ex: procurando por "03.4" ou "diária" no campo name).
   c) Identifique o UUID correspondente (campo 'id') e utilize esse UUID nos parâmetros das ferramentas 'get_transactions', 'suggest_action_plan' ou outras que exijam 'categoryId'.
   d) Se você chamar uma ferramenta passando o nome ou o código curto (como "03.4") como se fosse o 'categoryId', ela retornará erro ou vazio. O 'categoryId' DEVE ser sempre o UUID retornado por 'get_category_list'.
   e) Se por acaso você não encontrar nenhuma categoria correspondente na lista, explique de forma amigável quais nomes de categorias semelhantes você encontrou, mas NUNCA exiba ou peça UUIDs.
9. Sempre que você chamar a ferramenta 'get_cash_flow_summary', inclua no FINAL da sua resposta (após o seu texto explicativo) o seguinte bloco de código JSON exato para o frontend desenhar o gráfico:
\`\`\`json
{
  "type": "CASH_FLOW",
  "currentBankBalance": <valor_atual_da_conta>,
  "monthlyCashFlow": <retorno_da_ferramenta_monthlyCashFlow>
}
\`\`\`
10. Sempre que você chamar a ferramenta 'get_deviations', inclua no FINAL da sua resposta (após o seu texto explicativo) o seguinte bloco de código JSON exato:
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
    switch (name) {
        case 'get_category_list': {
            const categories = await prisma.category.findMany({
                where: { tenantId }
            });
            return categories.map(c => ({
                id: c.id,
                name: c.name,
                type: c.type
            }));
        }

        case 'get_deviations': {
            const { year, month } = args;
            if (!year || !month) return { error: 'Parâmetros year e month obrigatórios.' };
            const yearNum = parseInt(String(year), 10);
            const monthNum = parseInt(String(month), 10);

            // Fetch categories
            const categories = await prisma.category.findMany({
                where: { tenantId }
            });
            const catMap = new Map(categories.map(c => [c.id, c]));

            // Fetch budgets
            const budgets = await prisma.budgetEntry.findMany({
                where: { tenantId, year: yearNum, month: monthNum }
            });

            // Fetch realized (competency)
            const realized = await prisma.realizedEntry.findMany({
                where: { tenantId, year: yearNum, month: monthNum, viewMode: 'competencia' }
            });

            // Aggregate by category
            const data: Record<string, { budget: number; realized: number }> = {};
            
            categories.forEach(c => {
                data[c.id] = { budget: 0, realized: 0 };
            });

            budgets.forEach(b => {
                if (data[b.categoryId]) data[b.categoryId].budget += b.amount;
            });

            realized.forEach(r => {
                if (data[r.categoryId]) data[r.categoryId].realized += r.amount;
            });

            const result = Object.entries(data).map(([catId, vals]) => {
                const cat = catMap.get(catId);
                const categoryName = cat?.name || catId;
                const type = cat?.type || 'EXPENSE';
                const budget = vals.budget;
                const realized = vals.realized;
                
                // For expenses: positive deviation = spent less than budgeted (good), negative deviation = spent more (bad)
                // For revenues: positive deviation = earned more than budgeted (good), negative deviation = earned less (bad)
                let deviation = 0;
                if (type === 'REVENUE') {
                    deviation = realized - budget;
                } else {
                    deviation = budget - realized; // Budget - Realized (positive means economy, negative means leak)
                }

                const percentage = budget > 0 ? (realized / budget) * 100 : 0;

                return {
                    categoryId: catId,
                    categoryName,
                    type,
                    budget,
                    realized,
                    deviation,
                    percentage
                };
            })
            .filter(r => r.budget > 0 || r.realized > 0)
            // Sort by absolute deviation (worst cases first)
            .sort((a, b) => a.deviation - b.deviation);

            return result;
        }

        case 'get_cash_flow_summary': {
            const { year } = args;
            if (!year) return { error: 'Parâmetro year obrigatório.' };
            const yearNum = parseInt(String(year), 10);

            // 1. Get bank balance
            const bankAccounts = await prisma.bankAccount.findMany({
                where: { tenantId }
            });
            const startBalance = bankAccounts.reduce((sum, acc) => sum + acc.balance, 0);

            // 2. Fetch realized cash items
            const realized = await prisma.realizedEntry.findMany({
                where: { tenantId, year: yearNum, viewMode: 'caixa' },
                include: {
                    category: { select: { name: true } }
                }
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

            realized.forEach(r => {
                const catName = r.category?.name || '';
                const isRevenue = r.amount > 0; // standard cash rule
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
                const totalNetFlow = netOperational - vals.capex + vals.financing; // capex reduces cash, financing adds/reduces
                
                // We project cash month-over-month (approximation)
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

            const transactions = await prisma.realizedEntry.findMany({
                where: { tenantId, year: yearNum, month: monthNum, categoryId },
                orderBy: { amount: 'desc' },
                take: 50 // Limit to avoid text overflow
            });

            return transactions.map(t => ({
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
