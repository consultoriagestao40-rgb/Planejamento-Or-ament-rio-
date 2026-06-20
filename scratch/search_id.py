import urllib.request
import json

def main():
    url = "https://planejamento-or-ament-rio.vercel.app/api/diag-db-query"
    print(f"Fetching from {url}...")
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Error: {e}")
        return

    entries = data.get('detailedEntries', [])
    print(f"Total entries: {len(entries)}")
    
    # We want to find any entry with category 06.1.9 or ID 769ce5a9-1d15-4d5f-aad8-3795e0902364
    found = False
    for e in entries:
        cat_name = e['category'].lower()
        if '06.1.9' in cat_name or 'multas recebidas' in cat_name:
            print(f"FOUND: ID={e['id']} | Amt={e['amount']} | Cat={e['category']} | ExtId={e['externalId']} | Desc={e['description']}")
            found = True
            
    if not found:
        print("No category 06.1.9 found in the entries.")

if __name__ == '__main__':
    main()
