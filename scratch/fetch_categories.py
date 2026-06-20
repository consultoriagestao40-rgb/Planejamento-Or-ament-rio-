import urllib.request
import json

def main():
    url = "https://planejamento-or-ament-rio.vercel.app/api/diag-db-query"
    print(f"Fetching categories from {url}...")
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Error: {e}")
        return

    categories = data.get('detailedCategories', [])
    print(f"Total categories: {len(categories)}")
    for c in categories:
        print(f"  Name: {c['name']:<50} | Type: {c['type']:<8} | Dre: {c['entradaDre']}")

if __name__ == '__main__':
    main()
