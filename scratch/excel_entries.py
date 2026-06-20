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
    
    excel_entries = [e for e in entries if not e.get('externalId', '').startswith('sync-')]
    
    print("Excel (Manual) entries in DB for May 2026:")
    group_sums = {}
    for e in excel_entries:
        print(f"  Category: {e['category']:<50} | Amount: {e['amount']:<8} | Desc: {e['description']}")
        
        # Sum by group
        cat = e['category']
        code = cat.split()[0]
        group = code.split('.')[0]
        group_sums[group] = group_sums.get(group, 0) + e['amount']
        
    print("\nExcel Group Sums:")
    for k, v in sorted(group_sums.items()):
        print(f"  Group {k}: R$ {v:,.2f}")

if __name__ == '__main__':
    main()
