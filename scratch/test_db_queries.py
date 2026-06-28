import psycopg2
import re

DATABASE_URL = 'postgresql://postgres:BudgetHub20250@db.ryfshgnyghzrqrsvjkyz.supabase.co:5432/postgres?sslmode=require&hostaddr=54.94.90.106'

def classify_category(category_name, is_revenue):
    name = category_name.upper().strip()
    
    is_internal_transfer = (
        name.startswith('06.1.2') or name.startswith('06.2.2') or 
        name.startswith('6.1.2') or name.startswith('6.2.2')
    )
        
    is_intercompany_transfer = (
        name.startswith('06.1.1') or name.startswith('06.2.1') or 
        name.startswith('6.1.1') or name.startswith('6.2.1')
    )

    if is_internal_transfer:
        return 'TRANSFER'

    if is_intercompany_transfer:
        return 'FINANCING'

    is_group_06_financing = (
        name.startswith('06.1.5') or name.startswith('06.3.1') or 
        name.startswith('06.1.6') or name.startswith('06.3.2') or
        name.startswith('6.1.5') or name.startswith('6.3.1') or 
        name.startswith('6.1.6') or name.startswith('6.3.2')
    )

    is_capex = (
        name.startswith('07') or name.startswith('7.') or 
        'CAPEX' in name or 'INVESTIMENTO' in name or 'IMOBILIZADO' in name
    )
    if is_capex:
        return 'CAPEX'
    
    is_financing = (
        name.startswith('08') or name.startswith('8.') or 
        is_group_06_financing or
        'FINANCIAMENTO' in name or 'EMPRESTIMO' in name or 'EMPRÉSTIMO' in name or
        'SÓCIO' in name or 'SOCIO' in name or 'APORTE' in name or
        'MÚTUO' in name or 'MUTUO' in name
    )
    if is_financing:
        return 'FINANCING'
    
    return 'OPERATIONAL_IN' if is_revenue else 'OPERATIONAL_OUT'

def main():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    # 1. Fetch first tenant
    cur.execute('SELECT id, name FROM "Tenant" LIMIT 1')
    tenant = cur.fetchone()
    if not tenant:
        print("No tenants found.")
        return
    
    tenant_id, tenant_name = tenant
    print(f"=== Testing queries for Tenant: {tenant_name} ({tenant_id}) ===")

    # 2. Test deviations for June 2026 (Month 6)
    year, month = 2026, 6
    print(f"\n--- Budget vs Realized Deviations for {month}/{year} ---")
    
    cur.execute('SELECT id, name, type FROM "Category" WHERE "tenantId" = %s', (tenant_id,))
    categories = cur.fetchall()
    cat_map = {c[0]: (c[1], c[2]) for c in categories}

    cur.execute('SELECT "categoryId", amount FROM "BudgetEntry" WHERE "tenantId" = %s AND year = %s AND month = %s', (tenant_id, year, month))
    budgets = cur.fetchall()
    
    cur.execute('SELECT "categoryId", amount FROM "RealizedEntry" WHERE "tenantId" = %s AND year = %s AND month = %s AND "viewMode" = \'competencia\'', (tenant_id, year, month))
    realized = cur.fetchall()

    data = {c[0]: {'name': c[1], 'type': c[2], 'budget': 0.0, 'realized': 0.0} for c in categories}
    for cat_id, amt in budgets:
        if cat_id in data: data[cat_id]['budget'] += amt
    for cat_id, amt in realized:
        if cat_id in data: data[cat_id]['realized'] += amt

    deviations = []
    for cat_id, v in data.items():
        if v['budget'] == 0 and v['realized'] == 0:
            continue
        deviation = 0.0
        if v['type'] == 'REVENUE':
            deviation = v['realized'] - v['budget']
        else:
            deviation = v['budget'] - v['realized'] # positive is saving, negative is leak
        
        deviations.append({
            'name': v['name'],
            'type': v['type'],
            'budget': v['budget'],
            'realized': v['realized'],
            'deviation': deviation
        })

    # Sort worst deviations first (negative values represent leak/underperformance)
    deviations.sort(key=lambda x: x['deviation'])
    for d in deviations[:10]: # Print top 10
        print(f"Cat: {d['name']} ({d['type']}) | Budget: R$ {d['budget']:.2f} | Realized: R$ {d['realized']:.2f} | Dev: R$ {d['deviation']:.2f}")

    # 3. Test Cash Flow (DFC) summary
    print("\n--- Cash Flow Summary (DFC) ---")
    cur.execute('SELECT balance FROM "BankAccount" WHERE "tenantId" = %s', (tenant_id,))
    balances = cur.fetchall()
    start_balance = sum(b[0] for b in balances)
    print(f"Starting Bank Balance: R$ {start_balance:.2f}")

    cur.execute('''
        SELECT r.amount, r.month, c.name 
        FROM "RealizedEntry" r
        JOIN "Category" c ON r."categoryId" = c.id
        WHERE r."tenantId" = %s AND r.year = %s AND r."viewMode" = 'caixa'
    ''', (tenant_id, year))
    
    realized_cash = cur.fetchall()
    monthly_data = {m: {'inflow': 0.0, 'outflow': 0.0, 'capex': 0.0, 'financing': 0.0} for m in range(1, 13)}

    for amt, m, cat_name in realized_cash:
        if m < 1 or m > 12: continue
        is_revenue = amt > 0
        cls = classify_category(cat_name, is_revenue)
        val = abs(amt)
        if cls == 'OPERATIONAL_IN':
            monthly_data[m]['inflow'] += val
        elif cls == 'OPERATIONAL_OUT':
            monthly_data[m]['outflow'] += val
        elif cls == 'CAPEX':
            monthly_data[m]['capex'] += val
        elif cls == 'FINANCING':
            monthly_data[m]['financing'] += val

    current_cash = start_balance
    for m in range(1, 13):
        v = monthly_data[m]
        net_ops = v['inflow'] - v['outflow']
        net_flow = net_ops - v['capex'] + v['financing']
        current_cash += net_flow
        if v['inflow'] > 0 or v['outflow'] > 0:
            print(f"Month {m:02d} | Inflow: R$ {v['inflow']:.2f} | Outflow: R$ {v['outflow']:.2f} | CAPEX: R$ {v['capex']:.2f} | Net: R$ {net_flow:.2f} | Projected: R$ {current_cash:.2f}")

    cur.close()
    conn.close()

if __name__ == '__main__':
    main()
