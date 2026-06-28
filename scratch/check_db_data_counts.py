import psycopg2

DATABASE_URL = 'postgresql://postgres.ryfshgnyghzrqrsvjkyz:BudgetHub20250@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require&hostaddr=54.94.90.106'

def main():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    cur.execute('SELECT id, name FROM "Tenant"')
    tenants = cur.fetchall()
    
    for t_id, t_name in tenants:
        print(f"\nTenant: {t_name} ({t_id})")
        
        # Count budget entries for 2026
        cur.execute('SELECT month, count(*), sum(amount) FROM "BudgetEntry" WHERE "tenantId" = %s AND year = 2026 GROUP BY month ORDER BY month', (t_id,))
        budgets = cur.fetchall()
        print("  Budget Entries 2026:")
        for m, cnt, total in budgets:
            print(f"    Month {m}: {cnt} entries, Total Budget: R$ {total:.2f}")

        # Count realized entries for 2026
        cur.execute('SELECT month, count(*), sum(amount) FROM "RealizedEntry" WHERE "tenantId" = %s AND year = 2026 GROUP BY month ORDER BY month', (t_id,))
        realized = cur.fetchall()
        print("  Realized Entries 2026:")
        for m, cnt, total in realized:
            print(f"    Month {m}: {cnt} entries, Total Realized: R$ {total:.2f}")

    cur.close()
    conn.close()

if __name__ == '__main__':
    main()
