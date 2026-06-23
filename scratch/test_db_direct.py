import psycopg2

DATABASE_URL = 'postgresql://postgres:BudgetHub20250@db.ryfshgnyghzrqrsvjkyz.supabase.co:5432/postgres'

def main():
    print("=== DIRECT DB CONNECT TEST ===")
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        cur.execute("SELECT id, name FROM \"Tenant\"")
        tenants = cur.fetchall()
        print("Connected successfully! Tenants:")
        for t in tenants:
            print(t)
        cur.close()
        conn.close()
    except Exception as e:
        print("Connection failed:", e)

if __name__ == '__main__':
    main()
