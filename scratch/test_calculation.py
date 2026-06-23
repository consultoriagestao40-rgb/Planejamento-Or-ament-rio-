import psycopg2
import re

DATABASE_URL = 'postgresql://postgres.ryfshgnyghzrqrsvjkyz:BudgetHub20250@aws-0-sa-east-1.pooler.supabase.com:6543/postgres'

def get_clean_code(name):
    match = re.match(r'^(\d{1,2}(?:\.\d+)*)', name)
    return match.group(1) if match else ''

def main():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()

        # 1. Fetch Tenants
        cur.execute("SELECT id, name FROM \"Tenant\"")
        tenants = cur.fetchall()
        print("Tenants in DB:")
        for t in tenants:
            print(f"  {t[0]}: {t[1]}")
        
        target_tenant_ids = [t[0] for t in tenants]

        # 2. Fetch Categories
        cur.execute("SELECT id, name, type, \"tenantId\" FROM \"Category\" WHERE \"tenantId\" IN %s", (tuple(target_tenant_ids),))
        categories_raw = cur.fetchall()
        categories = []
        category_name_map = {}
        for c in categories_raw:
            cat = {
                'id': c[0],
                'name': c[1],
                'type': c[2],
                'tenantId': c[3]
            }
            categories.append(cat)
            category_name_map[cat['id']] = cat['name']
            if ':' in cat['id']:
                code = cat['id'].split(':')[1]
                if code not in category_name_map:
                    category_name_map[code] = cat['name']

        print(f"\nLoaded {len(categories)} categories.")

        # 3. Fetch Realized Entries for 2026
        cur.execute("""
            SELECT id, amount, month, year, \"categoryId\", \"tenantId\", \"externalId\", \"viewMode\"
            FROM \"RealizedEntry\"
            WHERE year = 2026 AND \"viewMode\" = 'competencia' AND \"tenantId\" IN %s
        """, (tuple(target_tenant_ids),))
        realized_raw = cur.fetchall()
        print(f"Loaded {len(realized_raw)} realized entries.")

        # 4. Fetch Budget Entries for 2026
        cur.execute("""
            SELECT id, amount, month, year, \"categoryId\", \"tenantId\"
            FROM \"BudgetEntry\"
            WHERE year = 2026 AND \"tenantId\" IN %s
        """, (tuple(target_tenant_ids),))
        budget_raw = cur.fetchall()
        print(f"Loaded {len(budget_raw)} budget entries.")

        # Deduplicate realized entries
        synced_months = set()
        for r in realized_raw:
            ext_id = r[6]
            if ext_id and ext_id.startswith('sync-'):
                synced_months.add((r[3], r[2])) # year, month

        realized_entries = []
        for r in realized_raw:
            ext_id = r[6]
            key = (r[3], r[2])
            if key in synced_months:
                if ext_id and ext_id.startswith('sync-'):
                    realized_entries.append(r)
            else:
                realized_entries.append(r)

        # Filter categories 06.1.1, etc.
        # realized_entries format: id(0), amount(1), month(2), year(3), categoryId(4), tenantId(5), externalId(6), viewMode(7)
        filtered_realized = []
        for r in realized_entries:
            cat_name = category_name_map.get(r[4], '')
            code = get_clean_code(cat_name)
            if code in ('06.1.2', '06.2.2'):
                continue
            if code in ('06.1.1', '06.2.1'): # consolidated is true
                continue
            filtered_realized.append(r)

        filtered_budget = []
        for b in budget_raw:
            cat_name = category_name_map.get(b[4], '')
            code = get_clean_code(cat_name)
            if code in ('06.1.2', '06.2.2'):
                continue
            if code in ('06.1.1', '06.2.1'):
                continue
            filtered_budget.append(b)

        print(f"Filtered Realized: {len(filtered_realized)}")
        print(f"Filtered Budget: {len(filtered_budget)}")

        # Print all realized for month 1 and 2 where category name starts with 01
        print("\n--- Raw Realized Entries for Jan & Feb starting with 01 ---")
        for r in filtered_realized:
            if r[2] in (1, 2):
                cat_name = category_name_map.get(r[4], '')
                if cat_name.startswith('01') or cat_name.startswith('1'):
                    print(f"Month: {r[2]} | Tenant: {r[5]} | Cat: {cat_name} | Amount: R$ {r[1]:,.2f} | ExtID: {r[6]}")

        # Now let's calculate totals like /api/sync
        sync_realized_values = {}
        for r in filtered_realized:
            cat_name = category_name_map.get(r[4])
            if cat_name:
                normalized_name = re.sub(r'[^A-Z0-9]', '', cat_name.upper())
                name_key = f"{normalized_name}|{r[2] - 1}"
                sync_realized_values[name_key] = sync_realized_values.get(name_key, 0.0) + float(r[1])
                
                # Revenue aggregator
                is_revenue = normalized_name.startswith('01')
                if is_revenue and normalized_name != '01RECEITABRUTA':
                    parent_key = f"01RECEITABRUTA|{r[2] - 1}"
                    sync_realized_values[parent_key] = sync_realized_values.get(parent_key, 0.0) + float(r[1])

        print("\n--- Sync Aggregated 01RECEITABRUTA ---")
        for m in range(12):
            key = f"01RECEITABRUTA|{m}"
            val = sync_realized_values.get(key, 0.0)
            print(f"Month {m+1}: R$ {val:,.2f}")

        # Let's check the category tree roots
        # Let's map categories into nodes
        nodes_map = {}
        code_map = {}
        name_map = {}

        for cat in categories:
            clean_code = get_clean_code(cat['name'])
            unique_key = f"{cat['type']}|{clean_code or cat['name'].strip()}"

            if unique_key in name_map:
                existing_node = name_map[unique_key]
                if cat['id'] not in existing_node['id'].split(','):
                    existing_node['id'] += ',' + cat['id']
                nodes_map[cat['id']] = existing_node
                continue

            node = {
                'id': cat['id'],
                'name': cat['name'],
                'code': clean_code,
                'children': [],
                'level': 0,
                'isSynthetic': False,
                'tenantId': cat['tenantId']
            }
            nodes_map[cat['id']] = node
            if ':' in cat['id']:
                nodes_map[cat['id'].split(':')[1]] = node
            name_map[unique_key] = node
            if clean_code:
                code_map[clean_code] = node
                if not clean_code.startsWith('0') if hasattr(clean_code, 'startsWith') else not clean_code.startswith('0'):
                    if len(clean_code) > 0:
                        code_map[f"0{clean_code}"] = node

        # Synthetic parents
        synthetic_parents = [
            {'code': '01.1', 'name': '01.1 - Receita de Serviços', 'parentCode': '01'},
            {'code': '01.2', 'name': '01.2 - Receitas de Vendas', 'parentCode': '01'},
            {'code': '02.1', 'name': '02.1 - Tributos', 'parentCode': '02'},
            {'code': '03.1', 'name': '03.1 Salarios e Remuneração', 'parentCode': '03'},
            {'code': '03.2', 'name': '03.2 Encargos Sociais', 'parentCode': '03'},
            {'code': '03.3', 'name': '03.3 Beneficios', 'parentCode': '03'},
            {'code': '03.4', 'name': '03.4 Diárias', 'parentCode': '03'},
            {'code': '03.5', 'name': '03.5 SSMA', 'parentCode': '03'},
            {'code': '03.6', 'name': '03.6 Materiais', 'parentCode': '03'},
            {'code': '03.7', 'name': '03.7 Equipamentos', 'parentCode': '03'},
            {'code': '03.8', 'name': '03.8 Comunicação/Sistema/Licenças', 'parentCode': '03'},
            {'code': '03.9', 'name': '03.9 Custo com Veiculo', 'parentCode': '03'},
            {'code': '04.1', 'name': '04.1 Salarios e Remuneração', 'parentCode': '04'},
            {'code': '04.2', 'name': '04.2 Encargos Sociais', 'parentCode:': '04'},
        ]
        # Skip full linking setup just to keep it fast, but let's see which roots are actually created.
        print("\nRoots identified in uniqueRootsMap:")
        # We can see the roots
        for k, v in name_map.items():
            if '.' not in v['code']:
                print(f"  {k} -> ID: {v['id']} | Code: {v['code']} | Name: {v['name']}")

    except Exception as e:
        print("Error:", e)
    finally:
        if cur: cur.close()
        if conn: conn.close()

if __name__ == '__main__':
    main()
