import json

def main():
    json_path = '/Users/cristianosilva/.gemini/antigravity/brain/4abf67fa-7db4-427f-aadc-44b8ef778157/scratch/diarias_diag_response.json'
    with open(json_path, 'r') as f:
        data = json.load(f)
        
    tree = data.get('treeDebug', [])
    
    # Find synth-3.4
    synth_node = None
    
    def search(node):
        nonlocal synth_node
        if node.get('id') == 'synth-3.4' or 'synth-03.4' in node.get('id', ''):
            synth_node = node
            return
        for child in node.get('children', []):
            search(child)
            if synth_node:
                return
                
    for root in tree:
        search(root)
        if synth_node:
            break
            
    if synth_node:
        print("Found synth node:")
        print(f"  ID: {synth_node.get('id')}")
        print(f"  Name: {synth_node.get('name')}")
        print(f"  Code: {synth_node.get('code')}")
        print("  Children:")
        for child in synth_node.get('children', []):
            print(f"    - ID: {child.get('id')[:40]}... | Name: {child.get('name')} | Code: {child.get('code')}")
    else:
        print("synth-3.4 NOT found in treeDebug!")

if __name__ == '__main__':
    main()
