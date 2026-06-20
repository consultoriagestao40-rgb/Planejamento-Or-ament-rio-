import urllib.request
import json
import re

def get_dre_for_month(entries, month_idx):
    month_entries = [e for e in entries if e['month'] == month_idx + 1]
    if not month_entries:
        return 0.0, 0.0, 0.0, {}
        
    has_sync = any(e.get('externalId', '').startswith('sync-') for e in month_entries)
    filtered_entries = [e for e in month_entries if e.get('externalId', '').startswith('sync-')] if has_sync else month_entries
    
    realizedValues = {}
    for e in filtered_entries:
        cat_name = e['category']
        norm_name = re.sub(r'[^A-Z0-9]', '', cat_name.upper())
        key = f"{norm_name}|{month_idx}"
        realizedValues[key] = realizedValues.get(key, 0.0) + e['amount']
        
    unique_cats = {}
    for e in month_entries:
        cat_name = e['category']
        parts = cat_name.split()
        if not parts:
            continue
        code = parts[0]
        unique_cats[code] = cat_name
        
    group_06_sum = 0.0
    group_06_rev = 0.0
    group_06_exp = 0.0
    details = {}
    
    for code, cat_name in unique_cats.items():
        norm_name = re.sub(r'[^A-Z0-9]', '', cat_name.upper())
        lookup_key = f"{norm_name}|{month_idx}"
        amount = realizedValues.get(lookup_key, 0.0)
        
        sign = 1
        if code.startswith('06.1'):
            sign = -1
            group_06_rev += amount
        else:
            if code.startswith('06') or code.startswith('6'):
                group_06_exp += amount
            
        signed_amount = sign * amount
        if code.startswith('06') or code.startswith('6'):
            group_06_sum += signed_amount
            details[code] = amount
            
    return group_06_sum, group_06_rev, group_06_exp, details

def main():
    url = "https://planejamento-or-ament-rio.vercel.app/api/diag-db-query"
    print(f"Fetching data from {url}...")
    try:
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0'},
            origin_req_host='planejamento-or-ament-rio.vercel.app'
        )
        with urllib.request.urlopen(req) as response:
            html = response.read()
            data = json.loads(html.decode('utf-8'))
    except Exception as e:
        print(f"Error fetching data: {e}")
        return

    entries = data.get('detailedEntries', [])
    print(f"Total entries fetched: {len(entries)}")

    # Group by month
    for m in range(12):
        month_name = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m]
        val_sum, val_rev, val_exp, details = get_dre_for_month(entries, m)
        print(f"\nMonth: {month_name} (Index {m})")
        print(f"  Group 06 Sum (negated revenues): R$ {val_sum:,.2f}")
        print(f"  Group 06 Revenues (06.1):       R$ {val_rev:,.2f}")
        print(f"  Group 06 Expenses (others):     R$ {val_exp:,.2f}")
        
        # Check if any category has values
        for code, amount in sorted(details.items()):
            print(f"    - {code}: R$ {amount:,.2f}")

if __name__ == '__main__':
    main()
