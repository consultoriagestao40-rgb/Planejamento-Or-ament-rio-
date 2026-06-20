import sqlite3

def main():
    try:
        conn = sqlite3.connect('/Users/cristianosilva/BudgetHub/prisma/dev.db')
        cur = conn.cursor()
        cur.execute("SELECT id, name, type, entradaDre FROM \"Category\" WHERE \"tenantId\"='1fa165e3-178f-4d8f-ae7c-434c720c82dd'")
        cats = cur.fetchall()
        print("Clean Tech Categories:")
        for c in sorted(cats, key=lambda x: x[1]):
            print(f"  ID: {c[0]:<45} | Name: {c[1]:<50} | Type: {c[2]:<8} | Dre: {c[3]}")
        cur.close()
        conn.close()
    except Exception as e:
        print("SQLite error:", e)

if __name__ == '__main__':
    main()
