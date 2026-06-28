import psycopg2

db_url = 'postgresql://postgres.ryfshgnyghzrqrsvjkyz:BudgetHub20250@sa-east-1.pooler.supabase.com:6543/postgres'
conn = psycopg2.connect(db_url)
cursor = conn.cursor()

cursor.execute("""
    SELECT c.name, SUM(r.amount) as total_raw
    FROM "RealizedEntry" r
    JOIN "Category" c ON r."categoryId" = c.id
    WHERE c.name LIKE '06%' OR c.name LIKE '6%'
    GROUP BY c.name
    ORDER BY c.name;
""")
rows = cursor.fetchall()
print("== GROUP 06 REALIZED SUMS IN DB ==")
for row in rows:
    print(f"Cat: {row[0]:<50} | Total Raw: {row[1]:,}")

conn.close()
