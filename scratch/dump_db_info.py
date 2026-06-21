import sqlite3

def main():
    conn = sqlite3.connect('prisma/dev.db')
    cur = conn.cursor()
    
    # List tables
    cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cur.fetchall()
    print("Tables:", [t[0] for t in tables])
    
    # Query Tenants
    try:
        cur.execute('SELECT id, name, cnpj FROM "Tenant"')
        tenants = cur.fetchall()
        print("\n=== Tenants ===")
        for t in tenants:
            print(t)
    except Exception as e:
        print("Error Tenant:", e)

    # Query BankAccounts
    try:
        cur.execute('SELECT id, name, balance, "tenantId" FROM "BankAccount"')
        accounts = cur.fetchall()
        print("\n=== Bank Accounts ===")
        for a in accounts:
            print(a)
    except Exception as e:
        print("Error BankAccount:", e)

    # Query RealizedEntries
    try:
        cur.execute('SELECT "viewMode", COUNT(*) FROM "RealizedEntry" GROUP BY "viewMode"')
        entries = cur.fetchall()
        print("\n=== RealizedEntry Counts ===")
        for e in entries:
            print(e)
    except Exception as e:
        print("Error RealizedEntry:", e)

    cur.close()
    conn.close()

if __name__ == '__main__':
    main()
