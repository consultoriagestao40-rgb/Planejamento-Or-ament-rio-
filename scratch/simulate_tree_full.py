import json

def normalizeCode(code):
    if not code:
        return ''
    return '.'.join(str(int(part)) if part.isdigit() else part for part in code.split('.'))

def main():
    json_path = '/Users/cristianosilva/.gemini/antigravity/brain/4abf67fa-7db4-427f-aadc-44b8ef778157/scratch/diarias_diag_response.json'
    with open(json_path, 'r') as f:
        data = json.load(f)
        
    # Wait, where is the categories list in the json?
    # Let's check if 'categories' exists
    # The route returns: { success: true, tenants, categories, realized, budgets }
    # Let's check keys: 'diariasCategories' is present. But what about 'categories'?
    # Ah, in inspect_diarias_values.py, we saw the keys were:
    # ['success', 'comparison', 'syncedMonths', 'm1DRE', 'm1ChartRaw', 'm1ServicosVendidosDRE', 
    #  'm1ServicosVendidosChart', 'm1DiariasDRE', 'm1DiariasChart', 'diariasCategories', 'treeDebug']
    # So 'diariasCategories' is the list of categories related to diárias.
    # What about other categories? They are not in the dump!
    # But wait, treeDebug is in the dump!
    # Let's look at the treeDebug nodes to see what is going on.
    
    tree = data.get('treeDebug', [])
    
    # Let's search tree for any node containing '8bbf7292' or 'a9e20abb'
    def find_nodes(node, res):
        ids = node.get('id', '').split(',')
        if any('8bbf7292' in i or 'a9e20abb' in i for i in ids):
            res.append(node)
        for child in node.get('children', []):
            find_nodes(child, res)
            
    matches = []
    for root in tree:
        find_nodes(root, matches)
        
    print(f"Found {len(matches)} matches in treeDebug:")
    for m in matches:
        print(f"Node: ID={m.get('id')} | Name={m.get('name')} | Code={m.get('code')} | ChildrenCount={len(m.get('children', []))}")
        for child in m.get('children', []):
            print(f"  - Child ID: {child.get('id')} | Name: {child.get('name')}")

if __name__ == '__main__':
    main()
