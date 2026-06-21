import psycopg2

db_url = 'postgresql://postgres.ryfshgnyghzrqrsvjkyz:BudgetHub20250@sa-east-1.pooler.supabase.com:6543/postgres'
print("Connecting to Supabase...")

conn = psycopg2.connect(db_url)
cursor = conn.cursor()

# 1. Ver lançamentos de despesas/custos
cursor.execute("""
    SELECT r.amount, r.description, c.name, r."costCenterId"
    FROM "RealizedEntry" r
    JOIN "Category" c ON r."categoryId" = c.id
    WHERE c.name LIKE '03%' OR c.name LIKE '3%' OR c.name LIKE '04%' OR c.name LIKE '4%'
    LIMIT 5;
""")
rows = cursor.fetchall()
print("\n== EXEMPLOS DE DESPESAS/CUSTOS REALIZADOS ==")
for row in rows:
    print(f"Valor: {row[0]}, Desc: {row[1]}, Cat: {row[2]}, CC: {row[3]}")

# 2. Ver se as despesas/custos têm valores negativos no banco
cursor.execute("""
    SELECT MIN(r.amount), MAX(r.amount), COUNT(*)
    FROM "RealizedEntry" r
    JOIN "Category" c ON r."categoryId" = c.id
    WHERE c.name LIKE '03%' OR c.name LIKE '3%' OR c.name LIKE '04%' OR c.name LIKE '4%';
""")
min_val, max_val, count = cursor.fetchone()
print(f"\nDespesas/Custos - Min: {min_val}, Max: {max_val}, Total: {count}")

# 3. Ver se as receitas têm valores negativos no banco
cursor.execute("""
    SELECT MIN(r.amount), MAX(r.amount), COUNT(*)
    FROM "RealizedEntry" r
    JOIN "Category" c ON r."categoryId" = c.id
    WHERE c.name LIKE '01%' OR c.name LIKE '1%';
""")
min_rev, max_rev, count_rev = cursor.fetchone()
print(f"Receitas - Min: {min_rev}, Max: {max_rev}, Total: {count_rev}")

# 4. Ver dados do Centro de Custo da Penha (Empresa de Onibus Nossa Senhora da Penha)
cursor.execute("""
    SELECT id, name FROM "CostCenter" WHERE name LIKE '%Penha%';
""")
cc_rows = cursor.fetchall()
print("\n== CENTROS DE CUSTO DA PENHA ==")
for cc in cc_rows:
    print(f"ID: {cc[0]}, Nome: {cc[1]}")
    cc_id = cc[0]
    
    # Ver receitas desse CC
    cursor.execute("""
        SELECT SUM(r.amount) FROM "RealizedEntry" r
        JOIN "Category" c ON r."categoryId" = c.id
        WHERE r."costCenterId" = %s AND (c.name LIKE '01%' OR c.name LIKE '1%')
        AND r.year = 2026 AND r.month BETWEEN 1 AND 6;
    """, (cc_id,))
    val_rev = cursor.fetchone()[0]
    print(f"  Receita Realizada (Jan-Jun 2026): {val_rev}")
    
    # Ver despesas desse CC
    cursor.execute("""
        SELECT SUM(r.amount) FROM "RealizedEntry" r
        JOIN "Category" c ON r."categoryId" = c.id
        WHERE r."costCenterId" = %s AND (c.name LIKE '03%' OR c.name LIKE '3%' OR c.name LIKE '04%' OR c.name LIKE '4%')
        AND r.year = 2026 AND r.month BETWEEN 1 AND 6;
    """, (cc_id,))
    val_exp = cursor.fetchone()[0]
    print(f"  Despesas/Custos Realizados (Jan-Jun 2026): {val_exp}")

conn.close()
