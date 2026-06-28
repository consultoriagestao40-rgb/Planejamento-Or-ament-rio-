import json

def main():
    json_path = '/Users/cristianosilva/.gemini/antigravity/brain/4abf67fa-7db4-427f-aadc-44b8ef778157/scratch/diarias_diag_response.json'
    with open(json_path, 'r') as f:
        data = json.load(f)
        
    cats = data.get('diariasCategories', [])
    types = set(c.get('type') for c in cats)
    print("Unique types:", types)

if __name__ == '__main__':
    main()
