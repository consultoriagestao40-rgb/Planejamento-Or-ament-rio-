import psycopg2

# Try connecting on port 5432
DATABASE_URL = 'postgresql://postgres.ryfshgnyghzrqrsvjkyz:BudgetHub20250@aws-0-sa-east-1.pooler.supabase.com:5432/postgres'

def main():
    print("=== DB QUERY PORT 5432 ===")
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        cur.execute('SELECT id, name FROM "Tenant"')
        tenants = cur.fetchall()
        print("Tenants:")
        for t in tenants:
            print(t)
        cur.close()
        conn.close()
    except Exception as e:
        print("Error:", e)

if __name__ == '__main__':
    main()
