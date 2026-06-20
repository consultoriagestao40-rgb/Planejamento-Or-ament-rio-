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
    print(f"Total entries fetched: {len(entries)}")
    
    # 1. Filter sync entries vs all
    has_sync = any(e.get('externalId', '').startswith('sync-') for e in entries)
    filtered = [e for e in entries if e.get('externalId', '').startswith('sync-')] if has_sync else entries
    
    print(f"\n--- Group 06 Sync entries (Filtered) ---")
    group_06_sync = [e for e in filtered if e['category'].split()[0].startswith('06') or e['category'].split()[0].startswith('6')]
    for e in group_06_sync:
        print(f"  ID: {e['id']} | Amount: R$ {e['amount']:9,.2f} | Category: {e['category']:<40} | ExtId: {e['externalId']} | Desc: {e['description']}")
        
    print(f"\n--- Group 06 non-Sync entries in DB (Unfiltered only) ---")
    other_entries = [e for e in entries if not e.get('externalId', '').startswith('sync-')]
    group_06_other = [e for e in other_entries if e['category'].split()[0].startswith('06') or e['category'].split()[0].startswith('6')]
    for e in group_06_other:
        print(f"  ID: {e['id']} | Amount: R$ {e['amount']:9,.2f} | Category: {e['category']:<40} | ExtId: {e['externalId']} | Desc: {e['description']}")

if __name__ == '__main__':
    main()
