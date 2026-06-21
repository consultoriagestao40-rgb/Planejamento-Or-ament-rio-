import sqlite3

DB_PATH = 'prisma/dev.db'

def main():
    print("=== SQLITE DB DIAGNOSIS ===")
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # 1. Fetch Tenants
    try:
        cur.execute('SELECT id, name, cnpj FROM "Tenant"')
        tenants = cur.fetchall()
        print("\nTenants in SQLite DB:")
        jvs_trat_id = None
        for t in tenants:
            tid, name, cnpj = t
            print(f"- ID: {tid}, Name: {name}, CNPJ: {cnpj}")
            if 'TRAT' in name.upper():
                jvs_trat_id = tid
    except Exception as e:
        print("Error fetching tenants:", e)
        return

    if not jvs_trat_id:
        print("\nCould not find tenant matching JVS TRATAMENTOS/TRATMENTOS!")
        cur.close()
        conn.close()
        return

    print(f"\nTarget Tenant JVS TRATAMENTOS: ID = {jvs_trat_id}")

    # 2. Fetch Category ID mappings for this tenant
    try:
        cur.execute('SELECT id, name, code, type FROM "Category" WHERE tenantId = ?', (jvs_trat_id,))
        categories = cur.fetchall()
        print(f"\nRevenue/Expense Categories for JVS TRATAMENTOS ({len(categories)} total):")
        rev_cat_ids = []
        for c in categories:
            cid, name, code, ctype = c
            # Check if revenue
            is_rev = False
            if code:
                clean_code = code.split(':')[1] if ':' in code else code
                if clean_code.startswith('01') or clean_code == '1':
                    is_rev = True
            if name and (name.startswith('01') or name.startswith('1')):
                is_rev = True
            
            if is_rev or ctype == 'REVENUE':
                rev_cat_ids.append(cid)
                print(f"- [REVENUE] ID: {cid}, Code: {code}, Name: {name}, Type: {ctype}")
    except Exception as e:
        print("Error fetching categories:", e)
        return

    # 3. Fetch Realized Entries for this tenant in 2026
    try:
        cur.execute('''
            SELECT id, categoryId, month, amount, description, customer, externalId, viewMode
            FROM "RealizedEntry"
            WHERE tenantId = ? AND year = 2026
        ''', (jvs_trat_id,))
        entries = cur.fetchall()
        print(f"\nFound {len(entries)} realized entries for JVS TRATAMENTOS in 2026:")
        
        # Summarize by month, viewMode, category
        month_summary = {}
        for entry in entries:
            eid, cid, month, amount, desc, cust, ext_id, view_mode = entry
            key = (month, view_mode)
            month_summary[key] = month_summary.get(key, 0.0) + amount

            # Print January entries or all if small
            if len(entries) <= 30 or month == 1:
                is_rev = cid in rev_cat_ids
                status = "REV" if is_rev else "EXP"
                print(f"[{status}] Month: {month}, Amt: {amount}, Cust: {cust}, Desc: {desc}, VM: {view_mode}, ExtId: {ext_id}")

        print("\nSummary of all realized entries by Month and ViewMode:")
        for key, total in sorted(month_summary.items()):
            month, view_mode = key
            print(f"- Month {month} ({view_mode}): R$ {total:,.2f}")
    except Exception as e:
        print("Error fetching realized entries:", e)

    cur.close()
    conn.close()

if __name__ == '__main__':
    main()
