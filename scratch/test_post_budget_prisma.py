import asyncio
from prisma import Prisma

async def main():
    db = Prisma()
    await db.connect()
    
    target_cc_id = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:5ee294c0-a5e6-11ef-8521-831ac6abba1c'
    final_category_id = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:01.1.1 -Serviços Vendidos'
    tenant_id = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f'
    
    print("Checking CostCenter...")
    cc = await db.costcenter.find_unique(where={'id': target_cc_id})
    print("CC in DB:", cc)
    
    print("Checking Category...")
    cat = await db.category.find_unique(where={'id': final_category_id})
    print("Category in DB:", cat)
    
    print("Checking Tenant...")
    t = await db.tenant.find_unique(where={'id': tenant_id})
    print("Tenant in DB:", t)
    
    print("Attempting insert...")
    try:
        entry = await db.budgetentry.create(
            data={
                'tenantId': tenant_id,
                'categoryId': final_category_id,
                'costCenterId': target_cc_id,
                'month': 7,
                'year': 2026,
                'amount': 70000.0,
                'isLocked': False
            }
        )
        print("Insert succeeded! Entry ID:", entry.id)
        
        # Clean up
        await db.budgetentry.delete(where={'id': entry.id})
        print("Cleaned up successfully.")
    except Exception as e:
        print("Prisma error during insert:", e)
        
    await db.disconnect()

if __name__ == '__main__':
    asyncio.run(main())
