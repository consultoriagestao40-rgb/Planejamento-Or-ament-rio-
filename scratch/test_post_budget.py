import psycopg2
import sys

def main():
    try:
        conn = psycopg2.connect(
            host="db.ryfshgnyghzrqrsvjkyz.supabase.co",
            database="postgres",
            user="postgres",
            password="BudgetHub20250",
            sslmode="require",
            hostaddr="54.94.90.106"
        )
        cursor = conn.cursor()
        
        target_cc_id = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:5ee294c0-a5e6-11ef-8521-831ac6abba1c'
        final_category_id = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:01.1.1 -Serviços Vendidos'
        tenant_id = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f'
        
        # 1. Check Cost Center
        print("Checking CostCenter...")
        cursor.execute('SELECT id, name FROM "CostCenter" WHERE id = %s', (target_cc_id,))
        cc = cursor.fetchone()
        print("CC in DB:", cc)
        
        # 2. Check Category
        print("Checking Category...")
        cursor.execute('SELECT id, name FROM "Category" WHERE id = %s', (final_category_id,))
        cat = cursor.fetchone()
        print("Category in DB:", cat)
        
        # 3. Check Tenant
        print("Checking Tenant...")
        cursor.execute('SELECT id, name FROM "Tenant" WHERE id = %s', (tenant_id,))
        t = cursor.fetchone()
        print("Tenant in DB:", t)
        
        # Try inserting
        print("Attempting insert...")
        cursor.execute('''
            INSERT INTO "BudgetEntry" (id, "tenantId", "categoryId", "costCenterId", month, year, amount)
            VALUES ('temp-test-id-12345', %s, %s, %s, 7, 2026, 70000.0)
        ''', (tenant_id, final_category_id, target_cc_id))
        print("Insert succeeded!")
        
        # Rollback so we don't pollute the DB
        conn.rollback()
        print("Rollback completed successfully.")
        
    except Exception as e:
        print("Database error:", e)

if __name__ == '__main__':
    main()
