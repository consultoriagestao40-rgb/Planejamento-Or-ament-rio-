import psycopg2

DATABASE_URL = 'postgresql://postgres.ryfshgnyghzrqrsvjkyz:BudgetHub20250@sa-east-1.pooler.supabase.com:6543/postgres'

def main():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    # Query categories with commas or specific UUIDs
    print("=== Categories in DB ===")
    cur.execute('SELECT id, name, "parentId", "tenantId", type FROM "Category" WHERE id LIKE \'%8bbf7292%\' OR id LIKE \'%,%\'')
    rows = cur.fetchall()
    print(f"Found {len(rows)} matching categories:")
    for row in rows:
        print(row)

    # Let's query JVS categories
    print("\n=== All Diárias Categories in DB ===")
    cur.execute('SELECT id, name, "parentId", "tenantId", type FROM "Category" WHERE name ILIKE \'%diária%\' OR name ILIKE \'%diaria%\'')
    rows = cur.fetchall()
    for row in rows:
        print(row)
        
    cur.close()
    conn.close()

if __name__ == '__main__':
    main()
