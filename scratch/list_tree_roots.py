import json

def main():
    json_path = '/Users/cristianosilva/.gemini/antigravity/brain/4abf67fa-7db4-427f-aadc-44b8ef778157/scratch/diarias_diag_response.json'
    with open(json_path, 'r') as f:
        data = json.load(f)
        
    tree = data.get('treeDebug', [])
    print(f"Total roots: {len(tree)}")
    for root in tree:
        print(f"Root: ID={root.get('id')[:60]}... | Name={root.get('name')} | Code={root.get('code')}")

if __name__ == '__main__':
    main()
