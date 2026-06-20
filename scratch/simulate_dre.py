import json

def main():
    file_path = '/Users/cristianosilva/.gemini/antigravity/brain/b3b4d5db-75ba-425a-96f8-58d56c59f5a5/.system_generated/steps/3484/content.md'
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    json_line = None
    for line in lines:
        if line.strip().startswith('{"success":true'):
            json_line = line.strip()
            break
            
    data = json.loads(json_line)
    entries = data.get('detailedEntries', [])
    
    # 1. Filter entries like /api/sync/route.ts
    has_sync = any(e.get('externalId', '').startswith('sync-') for e in entries)
    filtered_entries = [e for e in entries if e.get('externalId', '').startswith('sync-')] if has_sync else entries
    
    print(f"Total entries: {len(entries)}, Filtered entries: {len(filtered_entries)}")
    
    # 2. Replicate realizedValues name-based aggregation
    realizedValues = {}
    for e in filtered_entries:
        cat_name = e['category']
        normalized_name = cat_name.upper().replace(' ', '').replace('-', '').replace('.', '').replace('/', '')
        # Wait, the code in sync/route.ts does:
        # const normalizedName = catName.toUpperCase().replace(/[^A-Z0-9]/g, '');
        # Let's do exactly that:
        import re
        norm_name = re.sub(r'[^A-Z0-9]', '', cat_name.upper())
        # The key is norm_name + "|4" (for May, month 5, index 4)
        key = f"{norm_name}|4"
        realizedValues[key] = realizedValues.get(key, 0.0) + e['amount']
        
    # Let's print the realizedValues keys for Group 06
    print("\nrealizedValues keys for Group 06:")
    for k, v in sorted(realizedValues.items()):
        if k.startswith('06'):
            print(f"  {k}: R$ {v:,.2f}")
            
    # 3. Replicate frontend tree and calculateNode logic
    # In BudgetGrid.tsx, categories are loaded. Let's list the categories and compute the totals.
    # To do this accurately, we can get unique categories from the entries list.
    unique_cats = {}
    for e in entries: # use all entries to get all categories present
        cat_name = e['category']
        parts = cat_name.split()
        if not parts:
            continue
        code = parts[0]
        unique_cats[code] = cat_name
        
    print("\nUnique categories in DB:")
    for code, name in sorted(unique_cats.items()):
        print(f"  {code}: {name}")
        
    # Let's calculate DRE rows for month 5 (index 4)
    # isNegatedCode is true for code.startsWith('06.1')
    dre_rows = {}
    group_sums = {}
    
    for code, cat_name in unique_cats.items():
        norm_name = re.sub(r'[^A-Z0-9]', '', cat_name.upper())
        lookup_key = f"{norm_name}|4"
        amount = realizedValues.get(lookup_key, 0.0)
        
        # Determine DRE group
        sign = 1
        if code.startswith('06.1'):
            sign = -1
            
        signed_amount = sign * amount
        dre_rows[code] = (cat_name, amount, signed_amount)
        
        # Add to group total
        # Group 06 Despesas Financeiras
        if code.startswith('06') or code.startswith('6'):
            group_sums['06'] = group_sums.get('06', 0.0) + signed_amount
            
    print("\nIndividual category values in DRE:")
    for code, (name, raw, signed) in sorted(dre_rows.items()):
        if code.startswith('06'):
            print(f"  {code:<10} | {name:<50} | Raw: R$ {raw:,.2f} | Signed: R$ {signed:,.2f}")
            
    print(f"\nFinal Calculated '06' DRE Group Total: R$ {group_sums.get('06', 0.0):,.2f}")

if __name__ == '__main__':
    main()
