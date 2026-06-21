import sqlite3

def main():
    conn = sqlite3.connect('prisma/dev.db')
    cur = conn.cursor()
    cur.execute('SELECT * FROM "Tenant"')
    tenants = cur.fetchall()
    print("=== Tenants in dev.db ===")
    for t in tenants:
        print(t)
    cur.close()
    conn.close()

if __name__ == '__main__':
    main()
