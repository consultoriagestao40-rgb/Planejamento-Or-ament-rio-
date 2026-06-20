import urllib.request
import json
import re
import itertools

def main():
    url = "https://planejamento-or-ament-rio.vercel.app/api/diag-db-query"
    print(f"Fetching from {url}...")
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            html = response.read()
            data = json.loads(html.decode('utf-8'))
    except Exception as e:
        print(f"Error fetching data: {e}")
        return

    all_entries = data.get('detailedEntries', [])
    print(f"Total entries fetched: {len(all_entries)}")
    
    # Filter for May 2026 and sync entries (as Vercel/production has sync entries)
    month_entries = [e for e in all_entries if e['month'] == 5]
    has_sync = any(e.get('externalId', '').startswith('sync-') for e in month_entries)
    entries = [e for e in month_entries if e.get('externalId', '').startswith('sync-')] if has_sync else month_entries
    
    # Calculate category totals
    category_totals = {}
    for e in entries:
        cat = e['category']
        parts = cat.split()
        if not parts:
            continue
        code = parts[0]
        category_totals[code] = category_totals.get(code, 0.0) + e['amount']
        
    print("May 2026 Category Totals:")
    for code, amt in sorted(category_totals.items()):
        print(f"  {code:<10}: R$ {amt:,.2f}")
        
    # We want to match:
    # Target 1: 20,501.00 (or -20,501.00)
    # Target 2: -503.63 (or 503.63)
    
    codes = list(category_totals.keys())
    
    targets = {
        'Despesas Financeiras (20,501.00)': 20501.00,
        'Lucro Liquido (-503.63)': -503.63
    }
    
    for name, target in targets.items():
        print(f"\n--- Finding combinations for {name} ---")
        found = False
        
        # Test all combinations of signs (+1, -1) for subsets of finance_codes
        finance_codes = [c for c in codes if c.startswith('06') or c.startswith('6')]
        print(f"Finance codes tested: {finance_codes}")
        
        for r in range(1, len(finance_codes) + 1):
            for comb in itertools.combinations(finance_codes, r):
                for signs in itertools.product([1, -1], repeat=r):
                    val = sum(s * category_totals[c] for s, c in zip(signs, comb))
                    if abs(val - target) < 0.05:
                        expr = " + ".join(f"{s}*{c}({category_totals[c]:.2f})" for s, c in zip(signs, comb))
                        print(f"  MATCH: {expr} = {val:.2f}")
                        found = True
                        
        if not found:
            print("  No match using only finance codes. Testing ALL categories...")
            # Group totals:
            group_totals = {}
            for code, amt in category_totals.items():
                g = code.split('.')[0]
                group_totals[g] = group_totals.get(g, 0.0) + amt
                
            print(f"  Group Totals: {group_totals}")
            group_keys = list(group_totals.keys())
            for r in range(1, len(group_keys) + 1):
                for comb in itertools.combinations(group_keys, r):
                    for signs in itertools.product([1, -1], repeat=r):
                        val = sum(s * group_totals[g] for s, g in zip(signs, comb))
                        if abs(val - target) < 1.0: # allow 1.0 tolerance
                            expr = " + ".join(f"{s}*Group {g}({group_totals[g]:.2f})" for s, g in zip(signs, comb))
                            print(f"  GROUP MATCH: {expr} = {val:.2f}")

if __name__ == '__main__':
    main()
