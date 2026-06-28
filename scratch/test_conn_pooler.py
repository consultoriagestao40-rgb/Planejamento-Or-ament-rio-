import psycopg2

def main():
    try:
        conn = psycopg2.connect(
            host="aws-0-sa-east-1.pooler.supabase.com",
            port=6543,
            database="postgres",
            user="postgres.ryfshgnyghzrqrsvjkyz",
            password="BudgetHub20250",
            sslmode="require",
            hostaddr="54.94.90.106"
        )
        cursor = conn.cursor()
        print("Successfully connected to pooler!")
        
        target_cc_id = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:5ee294c0-a5e6-11ef-8521-831ac6abba1c'
        final_category_id = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f:01.1.1 -Serviços Vendidos'
        tenant_id = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f'
        
        # 1. Check Cost Center
        cursor.execute('SELECT id, name FROM "CostCenter" WHERE id = %s', (target_cc_id,))
        print("CC:", cursor.fetchone())
        
        # 2. Check Category
        cursor.execute('SELECT id, name FROM "Category" WHERE id = %s', (final_category_id,))
        print("Category:", cursor.fetchone())
        
        # 3. Check Tenant
        cursor.execute('SELECT id, name FROM "Tenant" WHERE id = %s', (tenant_id,))
        print("Tenant:", cursor.fetchone())
        
        # Try inserting
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
