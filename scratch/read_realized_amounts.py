import sqlite3

def main():
    conn = sqlite3.connect('prisma/dev.db')
    cur = conn.cursor()
    cur.execute('SELECT categoryId, amount, description FROM "RealizedEntry" LIMIT 10')
    rows = cur.fetchall()
    print("=== FIRST 10 SQLite REALIZED ENTRIES ===")
    for r in rows:
        print(f"CatId: {r[0]}, Amount: {r[1]}, Desc: {r[2]}")
    conn.close()

if __name__ == '__main__':
    main()
