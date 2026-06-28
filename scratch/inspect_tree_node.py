import json

def find_node_by_id(node, target_id):
    ids = node.get('id', '').split(',')
    if target_id in ids:
        return node
    for child in node.get('children', []):
        res = find_node_by_id(child, target_id)
        if res:
            return res
    return None

def main():
    json_path = '/Users/cristianosilva/.gemini/antigravity/brain/4abf67fa-7db4-427f-aadc-44b8ef778157/scratch/diarias_diag_response.json'
    with open(json_path, 'r') as f:
        data = json.load(f)
        
    tree = data.get('treeDebug', [])
    target = '8bbf7292-2181-4898-aad3-b2c00401b997'
    
    # Let's search in the tree
    found_node = None
    parent_node = None
    
    def search(node, parent=None):
        nonlocal found_node, parent_node
        ids = node.get('id', '').split(',')
        if target in ids:
            found_node = node
            parent_node = parent
            return
        for child in node.get('children', []):
            search(child, node)
            if found_node:
                return

    for root in tree:
        search(root)
        if found_node:
            break
            
    if found_node:
        print("Found node in tree:")
        print(f"  ID: {found_node.get('id')}")
        print(f"  Name: {found_node.get('name')}")
        print(f"  Code: {found_node.get('code')}")
        print(f"  IsSynthetic: {found_node.get('isSynthetic')}")
        if parent_node:
            print(f"  Parent Node ID: {parent_node.get('id')} | Name: {parent_node.get('name')} | Code: {parent_node.get('code')}")
        else:
            print("  Parent Node: None")
    else:
        print("Node not found in treeDebug!")

if __name__ == '__main__':
    main()
