import json

def normalizeCode(code):
    if not code:
        return ''
    return '.'.join(str(int(part)) if part.isdigit() else part for part in code.split('.'))

def main():
    json_path = '/Users/cristianosilva/.gemini/antigravity/brain/4abf67fa-7db4-427f-aadc-44b8ef778157/scratch/diarias_diag_response.json'
    with open(json_path, 'r') as f:
        data = json.load(f)
        
    cats = data.get('diariasCategories', [])
    print(f"Loaded {len(cats)} categories from diariasCategories.")
    
    # Let's run the exact loop from route.ts
    nameMap = {}
    map_nodes = {}
    codeMap = {}
    
    for cat in cats:
        # Replicating JS logic:
        # const cleanCode = (cat.name.match(/^(\d{1,2}(?:\.\d+)*)/) || [])[1] || '';
        # const normCode = normalizeCode(cleanCode);
        # const uniqueKey = `${cat.type}|${normCode || cat.name.trim()}`;
        import re
        match = re.match(r'^(\d{1,2}(?:\.\d+)*)', cat['name'])
        cleanCode = match.group(1) if match else ''
        normCode = normalizeCode(cleanCode)
        uniqueKey = f"{cat['type']}|{normCode or cat['name'].strip()}"
        
        print(f"\nProcessing Cat: id={cat['id']} | name={cat['name']} | normCode={normCode} | uniqueKey={uniqueKey}")
        
        if uniqueKey in nameMap:
            existingNode = nameMap[uniqueKey]
            print(f"  -> Merging with existing node: id={existingNode['id']} | name={existingNode['name']}")
            existing_ids = existingNode['id'].split(',')
            if cat['id'] not in existing_ids:
                existingNode['id'] += ',' + cat['id']
                print(f"  -> Updated node ID to: {existingNode['id']}")
            map_nodes[cat['id']] = existingNode
            continue
            
        node = {
            'id': cat['id'],
            'name': cat['name'],
            'code': normCode,
            'children': [],
            'level': 0,
            'isSynthetic': False,
            'tenantId': cat['tenantId']
        }
        map_nodes[cat['id']] = node
        if ':' in cat['id']:
            col_id = cat['id'].split(':')[1]
            map_nodes[col_id] = node
            print(f"  -> Added colon split mapping: {col_id} -> node")
        nameMap[uniqueKey] = node
        if normCode:
            codeMap[normCode] = node
            
    print("\n=== Final nameMap keys and their nodes ===")
    for key, node in nameMap.items():
        print(f"Key: {key} | Node ID: {node['id'][:60]}... | Name: {node['name']}")

if __name__ == '__main__':
    main()
