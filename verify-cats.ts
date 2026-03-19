import { prisma } from './src/lib/prisma';
import { getValidAccessToken } from './src/lib/services';

async function verifyCats() {
    const spot = await prisma.tenant.findFirst({ where: { name: { contains: 'SPOT' } } });
    if (!spot) return;
    const { token } = await getValidAccessToken(spot.id);
    
    // API Categories
    const res = await fetch(`https://api-v2.contaazul.com/v1/categorias`, { headers: { 'Authorization': `Bearer ${token}` } });
    const apiCats = await res.json();
    const apiList = Array.isArray(apiCats) ? apiCats : (apiCats.itens || []);
    
    // DB Categories
    const dbCats = await prisma.category.findMany({ where: { tenantId: spot.id } });
    
    console.log(`SPOT Categories [API]: ${apiList.length}`);
    apiList.forEach((c: any) => console.log(` - API: [${c.id}] ${c.name}`));
    
    console.log(`SPOT Categories [DB]: ${dbCats.length}`);
    dbCats.forEach((c: any) => console.log(` - DB: [${c.id}] ${c.name}`));
}
verifyCats();
