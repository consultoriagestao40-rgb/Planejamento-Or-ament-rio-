
import { NextResponse } from 'next/server';
import { syncData } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const costCenterId = searchParams.get('costCenterId') || 'DEFAULT';

        // Se o centro de custo não for 'DEFAULT' ou 'CC1' (Comercial), não mostramos vendas por enquanto
        // (Assumindo que vendas pertencem ao comercial/geral)
        if (costCenterId !== 'DEFAULT' && costCenterId !== 'CC1') {
            return NextResponse.json({
                success: true,
                realizedValues: {},
                raw: {}
            });
        }

        const data = await syncData();

        // Dicionário de De-Para (Conta Azul -> Nosso Sistema)
        // IDs fictícios da Conta Azul mapeados para nossos IDs
        const CATEGORY_MAPPING: Record<string, string> = {
            // Exemplo: ID da "Receita de Venda de Produto" na CA -> '1.1'
            "ca_cat_products": "1.1",
            "00000000-0000-0000-0000-000000000001": "1.1", // Mock ID vindo do services.ts se houver fallback

            // Exemplo: ID da "Prestação de Serviços" na CA -> '1.2'
            "ca_cat_services": "1.2",
            "00000000-0000-0000-0000-000000000002": "1.2",

            // Fallbacks por nome (normalizados)
            "venda de produtos": "1.1",
            "venda de servicos": "1.2",
            "servicos prestados": "1.2",
            "receita de vendas": "1.1"
        };

        const realizedValues: Record<string, number> = {};

        if (data.sales && Array.isArray(data.sales)) {
            data.sales.forEach((sale: any) => {
                if (!sale.emission_date) return;

                const date = new Date(sale.emission_date);
                const monthIndex = date.getMonth(); // 0-11
                const year = date.getFullYear();
                const currentYear = new Date().getFullYear();

                // Filtra apenas ano atual para simplificar visualização
                if (year === currentYear) {

                    // Lógica de Mapeamento de Categoria
                    let finalCategoryId = "1.3"; // Default: Outras Receitas (se existisse) ou 1.1 fallback

                    // Tenta identificar categoria pelo ID ou Nome que vier da API
                    // Nota: O objeto sale pode ter ca_category_id ou product_category_id dependendo da API
                    const sourceId = sale.category_id || sale.product_category_id;
                    const sourceName = sale.category_name || (sale.product_category && sale.product_category.name);

                    if (sourceId && CATEGORY_MAPPING[sourceId]) {
                        finalCategoryId = CATEGORY_MAPPING[sourceId];
                    } else if (sourceName && CATEGORY_MAPPING[sourceName.toLowerCase()]) {
                        finalCategoryId = CATEGORY_MAPPING[sourceName.toLowerCase()];
                    } else {
                        // Heurística simples: se não mapeou, joga em Produtos (1.1) por padrão
                        finalCategoryId = "1.1";
                    }

                    const key = `${finalCategoryId}-${monthIndex}`;
                    realizedValues[key] = (realizedValues[key] || 0) + sale.value;
                }
            });
        }

        return NextResponse.json({
            success: true,
            realizedValues,
            raw: data // Send raw for debug if needed
        });
    } catch (error: any) {
        console.error('Sync error:', error);
        return NextResponse.json({
            success: false,
            error: error.message || 'Failed to sync data'
        }, { status: 500 });
    }
}
