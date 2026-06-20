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
    
    # We want to find any entry whose amount is exactly 86.87 or close, or combinations of 2 entries
    target = 86.87
    print(f"\nSearching for entries with amount close to {target}...")
    for e in entries:
        if abs(e['amount'] - target) < 0.05:
            print(f"  Exact Match: ID={e['id']} | Amount: R$ {e['amount']:.2f} | Cat: {e['category']} | ExtId: {e['externalId']} | Desc: {e['description']}")
            
    print(f"\nSearching for pairs of entries whose difference or sum is close to {target}...")
    for i in range(len(entries)):
        for j in range(i + 1, len(entries)):
            val1 = entries[i]['amount']
            val2 = entries[j]['amount']
            if abs((val1 + val2) - target) < 0.05:
                print(f"  Sum Match: R$ {val1:.2f} + R$ {val2:.2f} = {val1+val2:.2f}")
                print(f"    1: {entries[i]['category']} - {entries[i]['description']} (ExtId: {entries[i]['externalId']})")
                print(f"    2: {entries[j]['category']} - {entries[j]['description']} (ExtId: {entries[j]['externalId']})")
            if abs((val1 - val2) - target) < 0.05:
                print(f"  Diff Match: R$ {val1:.2f} - R$ {val2:.2f} = {val1-val2:.2f}")
                print(f"    1: {entries[i]['category']} - {entries[i]['description']} (ExtId: {entries[i]['externalId']})")
                print(f"    2: {entries[j]['category']} - {entries[j]['description']} (ExtId: {entries[j]['externalId']})")

if __name__ == '__main__':
    main()
