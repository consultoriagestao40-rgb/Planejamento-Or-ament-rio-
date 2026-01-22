'use server'

import { prisma } from '@/lib/prisma';

export async function testDatabaseConnection() {
    try {
        const testTenant = await prisma.tenant.create({
            data: {
                name: "Teste de Conexão DB",
                cnpj: `TESTE-${Date.now()}`,
                accessToken: "test-token",
                refreshToken: "test-refresh",
                tokenExpiresAt: new Date()
            }
        });
        return { success: true, message: `Tenant criado com ID: ${testTenant.id}` };
    } catch (error: any) {
        console.error("DB Write Error:", error);
        return { success: false, error: error.message };
    }
}

export async function resetDatabase() {
    try {
        await prisma.tenant.deleteMany({});
        return { success: true, message: "Banco limpo com sucesso!" };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
