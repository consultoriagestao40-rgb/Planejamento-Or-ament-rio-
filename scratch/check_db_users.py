import psycopg2

DATABASE_URL = 'postgresql://postgres:BudgetHub20250@db.ryfshgnyghzrqrsvjkyz.supabase.co:5432/postgres'

def main():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
    except Exception as e:
        print(f"Erro ao conectar na direct URL: {e}")
        return

    print("--- USUÁRIOS ---")
    cur.execute('SELECT id, name, email, role FROM "User"')
    users = cur.fetchall()
    for u in users:
        print(f"ID: {u[0]} | Nome: {u[1]} | Email: {u[2]} | Role: {u[3]}")

    print("\n--- TENANTS ---")
    cur.execute('SELECT id, name, cnpj FROM "Tenant"')
    tenants = cur.fetchall()
    for t in tenants:
        print(f"ID: {t[0]} | Nome: {t[1]} | CNPJ: {t[2]}")

    print("\n--- USER TENANT ACCESS ---")
    cur.execute('SELECT "userId", "tenantId" FROM "UserTenantAccess"')
    access = cur.fetchall()
    for a in access:
        print(f"UserId: {a[0]} | TenantId: {a[1]}")

    print("\n--- COUNT OF OTHER DATA ---")
    for table in ["Category", "CostCenter", "BudgetEntry", "RealizedEntry", "DeviationAnalysis"]:
        try:
            cur.execute(f'SELECT COUNT(*) FROM "{table}"')
            count = cur.fetchone()[0]
            print(f"Tabela {table}: {count} registros")
        except Exception as e:
            print(f"Erro ao ler {table}: {e}")

    cur.close()
    conn.close()

if __name__ == '__main__':
    main()
