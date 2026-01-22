import { prisma } from '@/lib/prisma';

interface ContaAzulCategory {
    id: string;
    nome: string;
    // ... other fields
}

export async function fetchCategories(accessToken: string) {
    const response = await fetch('https://api.contaazul.com/v1/categorias', {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
        }
    });

    if (!response.ok) {
        throw new Error('Failed to fetch categories');
    }

    return response.json();
}
