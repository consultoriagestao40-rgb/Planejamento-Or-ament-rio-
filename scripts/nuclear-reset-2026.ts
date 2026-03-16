
import { prisma } from '../src/lib/prisma';

async function run() {
    console.log('🚀 Iniciando Cleanup Nuclear v0.4.0 (Apenas 2026)...');
    
    // 1. Deletar todos os dados de 2026
    const deletedEntries = await prisma.realizedEntry.deleteMany({
        where: { year: 2026 }
    });
    console.log(`✅ Deletadas ${deletedEntries.count} entradas de 2026.`);
    
    const deletedLogs = await prisma.auditLog.deleteMany({
        where: { createdAt: { gte: new Date('2026-01-01') } }
    });
    console.log(`✅ Deletados ${deletedLogs.count} logs de auditoria de 2026.`);

    // 2. Pegar os IDs Primários das empresas
    const allTenants = await prisma.tenant.findMany();
    const companyGroups = new Map<string, string[]>();
    allTenants.forEach((t: any) => {
        const cleanCnpj = (t.cnpj || '').replace(/\D/g, '');
        const cleanName = (t.name || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        const key = cleanCnpj !== '' ? cleanCnpj : cleanName;
        if (!companyGroups.has(key)) companyGroups.set(key, []);
        companyGroups.get(key)!.push(t.id);
    });

    const primaryTenantIds: string[] = Array.from(companyGroups.values()).map(ids => ids.sort()[0]);
    console.log(`🔍 IDs Primários identificados:`, primaryTenantIds);

    console.log('📡 O reset foi concluído localmente na base de produção (via script).');
    console.log('👉 Agora, dispare a sincronização manual pelo Dashboard para reconstruir com os IDs corretos.');
}

run().catch(console.error);
