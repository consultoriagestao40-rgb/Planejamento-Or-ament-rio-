import psycopg2

DATABASE_URL = 'postgresql://postgres.ryfshgnyghzrqrsvjkyz:BudgetHub20250@aws-0-sa-east-1.pooler.supabase.com:6543/postgres'

def main():
    print("=== DB QUERY (PYTHON) ===")
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    # Get tenants
    cur.execute('SELECT id, name, cnpj FROM "Tenant"')
    tenants = cur.fetchall()
    print("\nTenants:")
    for t in tenants:
        print(f"ID: {t[0]}, Name: {t[1]}, CNPJ: {t[2]}")

    cur.close()
    conn.close()

if __name__ == '__main__':
    main()
