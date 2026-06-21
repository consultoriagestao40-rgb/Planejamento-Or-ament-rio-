import psycopg2

DATABASE_URL = 'postgresql://postgres.ryfshgnyghzrqrsvjkyz:BudgetHub20250@sa-east-1.pooler.supabase.com:6543/postgres'

def main():
    print("=== DUMPING BUDGET AND REALIZED ENTRIES ===")
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    # Query sum of amount by category, month, and type
    cur.execute('''
        SELECT c.name, e.month, e.type, SUM(e.amount) 
        FROM "BudgetEntry" e
        JOIN "Category" c ON e."categoryId" = c.id
        WHERE c."tenantId" = 'cleantech' OR c."tenantId" = 'DEFAULT'
        GROUP BY c.name, e.month, e.type
        ORDER BY c.name, e.month, e.type
        LIMIT 100
    ''')
    
    rows = cur.fetchall()
    for r in rows:
        print(f"Cat: {r[0]}, Month: {r[1]}, Type: {r[2]}, Sum: {r[3]}")

    cur.close()
    conn.close()

if __name__ == '__main__':
    main()
