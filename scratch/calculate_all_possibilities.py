import urllib.request
import json
import re

def calculate_dre_for_month(entries, month_idx, use_sync_only):
    month_entries = [e for e in entries if e['month'] == month_idx + 1]
    if not month_entries:
        return 0.0, 0.0, 0.0, 0.0
        
    if use_sync_only:
        has_sync = any(e.get('externalId', '').startswith('sync-') for e in month_entries)
        filtered = [e for e in month_entries if e.get('externalId', '').startswith('sync-')] if has_sync else month_entries
    else:
        filtered = month_entries
        
    # Replicate realizedValues aggregation
    realizedValues = {}
    for e in filtered:
        cat_name = e['category']
        norm_name = re.sub(r'[^A-Z0-9]', '', cat_name.upper())
        key = f"{norm_name}|{month_idx}"
        realizedValues[key] = realizedValues.get(key, 0.0) + e['amount']
        
    # Aggregate DRE
    # We need to map category codes to their DRE group
    # 01 -> rev, 02 -> taxes, 03 -> costs, 04 -> opExp, 05 -> adminExp, 06 -> fin
    vRev = 0.0
    vTaxes = 0.0
    vCosts = 0.0
    vOpExp = 0.0
    vAdminExp = 0.0
    vFin = 0.0
    
    unique_codes = set()
    for e in month_entries:
        parts = e['category'].split()
        if parts:
            unique_codes.add(parts[0])
            
    for code in unique_codes:
        # Find category name
        cat_entry = next(e for e in month_entries if e['category'].split()[0] == code)
        cat_name = cat_entry['category']
        norm_name = re.sub(r'[^A-Z0-9]', '', cat_name.upper())
        lookup_key = f"{norm_name}|{month_idx}"
        amount = realizedValues.get(lookup_key, 0.0)
        
        if code.startswith('01') or code == '1':
            vRev += amount
        elif code.startswith('02') or code == '2':
            vTaxes += amount
        elif code.startswith('03') or code == '3':
            vCosts += amount
        elif code.startswith('04') or code == '4':
            vOpExp += amount
        elif code.startswith('05') or code == '5':
            vAdminExp += amount
        elif code.startswith('06') or code == '6':
            # isNegatedCode is true for code.startsWith('06.1')
            sign = -1 if code.startswith('06.1') else 1
            vFin += sign * amount
            
    vRecLiq = vRev - vTaxes
    vGrossMarg = vRecLiq - vCosts
    vContribMarg = vGrossMarg - vOpExp
    vEbitda = vContribMarg - vAdminExp
    vNetProfit = vEbitda - vFin
    
    return vFin, vNetProfit, vRev, vCosts

def main():
    url = "https://planejamento-or-ament-rio.vercel.app/api/diag-db-query"
    print(f"Fetching from {url}...")
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Error: {e}")
        return

    entries = data.get('detailedEntries', [])
    print(f"Total entries: {len(entries)}")
    
    for use_sync_only in [True, False]:
        mode = "SYNC ONLY (Filtered)" if use_sync_only else "ALL ENTRIES (Unfiltered)"
        print(f"\n=================== {mode} ===================")
        for m in range(12):
            month_name = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m]
            vFin, vNetProfit, vRev, vCosts = calculate_dre_for_month(entries, m, use_sync_only)
            if vFin != 0.0 or vNetProfit != 0.0:
                print(f"Month: {month_name:<3} | vFin: R$ {vFin:12,.2f} | NetProfit: R$ {vNetProfit:12,.2f} | Rev: R$ {vRev:12,.2f} | Costs: R$ {vCosts:12,.2f}")

if __name__ == '__main__':
    main()
