import json

def main():
    json_path = '/Users/cristianosilva/.gemini/antigravity/brain/4abf67fa-7db4-427f-aadc-44b8ef778157/scratch/diarias_diag_response.json'
    with open(json_path, 'r') as f:
        data = json.load(f)
        
    print("Keys in JSON:", list(data.keys()))
    
    print("\n=== m1DRE ===")
    print(json.dumps(data.get('m1DRE'), indent=2))
    
    print("\n=== m1DiariasDRE ===")
    print(json.dumps(data.get('m1DiariasDRE'), indent=2))

    print("\n=== m1DiariasChart ===")
    print(json.dumps(data.get('m1DiariasChart'), indent=2))

    print("\n=== first few elements of treeDebug ===")
    tree = data.get('treeDebug', [])
    for node in tree[:3]:
        print(f"Node ID: {node.get('id')} | Name: {node.get('name')} | Code: {node.get('code')}")
        # if has children:
        if node.get('children'):
            print("  Children:")
            for child in node['children'][:5]:
                print(f"    - ID: {child.get('id')} | Name: {child.get('name')} | Code: {child.get('code')}")

if __name__ == '__main__':
    main()
