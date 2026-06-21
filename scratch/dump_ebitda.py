import urllib.request
import urllib.parse
import json

VERCEL_URL = 'https://planejamento-or-ament-rio.vercel.app'

def run_sql(sql_query):
    params = urllib.parse.urlencode({'action': 'query-sql', 'sql': sql_query})
    url = f"{VERCEL_URL}/api/debug-db?{params}"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as response:
            res_data = response.read().decode('utf-8')
            return json.loads(res_data)
    except Exception as e:
        return {"success": False, "error": str(e)}

def main():
    # 1. Fetch tenants
    print("Fetching tenants...")
    res = run_sql("SELECT id, name FROM \"Tenant\"")
    if not res.get('success'):
        print("Failed:", res.get('error'))
        return
    tenants = res.get('result', [])
    print("Tenants:", tenants)
    
    # Let's inspect JVS Facilities (or all tenants)
    for tenant in tenants:
        t_id = tenant['id']
        t_name = tenant['name']
        print(f"\n--- Tenant: {t_name} ({t_id}) ---")
        
        # We need categories to classify them
        res_cats = run_sql(f"SELECT id, name, type FROM \"Category\" WHERE \"tenantId\" = '{t_id}'")
        cats = res_cats.get('result', [])
        print(f"Loaded {len(cats)} categories")
        
        # Let's fetch all budgets for 2026
        res_budgets = run_sql(f"SELECT month, amount, \"categoryId\" FROM \"BudgetEntry\" WHERE \"tenantId\" = '{t_id}' AND year = 2026")
        budgets = res_budgets.get('result', [])
        
        # Let's fetch all realized for 2026
        res_realized = run_sql(f"SELECT month, amount, \"categoryId\" FROM \"RealizedEntry\" WHERE \"tenantId\" = '{t_id}' AND year = 2026 AND \"viewMode\" = 'competencia'")
        realized = res_realized.get('result', [])
        
        print(f"Loaded {len(budgets)} budget entries and {len(realized)} realized entries")
        
        # Map categories by id
        cat_map = {c['id']: c for c in cats}
        
        # Monthly totals for DRE structure
        # EBITDA = ContribMarg - AdminExp
        # ContribMarg = GrossMarg - OpExp
        # GrossMarg = RecLiq - Costs
        # RecLiq = Rev - Taxes
        # So: EBITDA = (Rev - Taxes - Costs - OpExp) - AdminExp
        # Wait, let's verify if that's correct.
        # Yes, in calculateTotals:
        # vEbitda = vContribMarg - vAdminExp
        # vContribMarg = vGrossMarg - vOpExp
        # vGrossMarg = vRecLiq - vCosts
        # vRecLiq = vRev - vTaxes
        # So EBITDA = vRev - vTaxes - vCosts - vOpExp - vAdminExp.
        
        monthly_data = [{'rev_b': 0, 'rev_r': 0, 'tax_b': 0, 'tax_r': 0, 'cost_b': 0, 'cost_r': 0, 'opExp_b': 0, 'opExp_r': 0, 'adminExp_b': 0, 'adminExp_r': 0} for _ in range(12)]
        
        def get_bucket(cat_name):
            import re
            match = re.match(r'^(\d{1,2}(?:\.\d+)*)', cat_name or '')
            code = match.group(1) if match else ''
            if code.startswith('01') or code == '1': return 'rev'
            elif code.startswith('02') or code == '2': return 'tax'
            elif code.startswith('3') or code.startswith('03'): return 'cost'
            elif code.startswith('4') or code.startswith('04'): return 'opExp'
            elif code.startswith('5') or code.startswith('05') or code.startswith('7') or code.startswith('07') or code.startswith('8') or code.startswith('08'): return 'adminExp'
            return None

        for b in budgets:
            c = cat_map.get(b['categoryId'])
            if c:
                bucket = get_bucket(c['name'])
                if bucket:
                    monthly_data[b['month']-1][f'{bucket}_b'] += float(b['amount'])
                    
        for r in realized:
            c = cat_map.get(r['categoryId'])
            if c:
                bucket = get_bucket(c['name'])
                if bucket:
                    monthly_data[r['month']-1][f'{bucket}_r'] += float(r['amount'])
                    
        for m in range(12):
            d = monthly_data[m]
            ebitda_b = d['rev_b'] - d['tax_b'] - d['cost_b'] - d['opExp_b'] - d['adminExp_b']
            ebitda_r = d['rev_r'] - d['tax_r'] - d['cost_r'] - d['opExp_r'] - d['adminExp_r']
            print(f"Month {m+1:02d}: EBITDA Budget = {ebitda_b:12,.2f} | EBITDA Realized = {ebitda_r:12,.2f}")

if __name__ == '__main__':
    main()
