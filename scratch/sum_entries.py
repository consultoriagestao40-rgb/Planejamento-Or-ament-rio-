import urllib.request
import json
import re

def main():
    url = "https://planejamento-or-ament-rio.vercel.app/api/diag-db-query"
    print(f"Fetching detailed entries from {url}...")
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Error: {e}")
        return

    entries = data.get('detailedEntries', [])
    print(f"Total entries: {len(entries)}")
    
    sync_entries = [e for e in entries if e.get('externalId', '').startswith('sync-')]
    excel_entries = [e for e in entries if not e.get('externalId', '').startswith('sync-')]
    
    print("\n--- Group 06 SYNC entries ---")
    sync_06 = [e for e in sync_entries if e['category'].split()[0].startswith('06') or e['category'].split()[0].startswith('6')]
    sum_sync_06 = 0.0
    for e in sync_06:
        code = e['category'].split()[0]
        sign = -1 if code.startswith('06.1') else 1
        signed_amt = sign * e['amount']
        sum_sync_06 += signed_amt
        print(f"  {code:<8} | Amount: R$ {e['amount']:9,.2f} | Signed: R$ {signed_amt:9,.2f} | Desc: {e['description']}")
    print(f"Total SYNC Group 06 sum: R$ {sum_sync_06:,.2f}")
    
    print("\n--- Group 06 EXCEL entries ---")
    excel_06 = [e for e in excel_entries if e['category'].split()[0].startswith('06') or e['category'].split()[0].startswith('6')]
    sum_excel_06 = 0.0
    for e in excel_06:
        code = e['category'].split()[0]
        sign = -1 if code.startswith('06.1') else 1
        signed_amt = sign * e['amount']
        sum_excel_06 += signed_amt
        print(f"  {code:<8} | Amount: R$ {e['amount']:9,.2f} | Signed: R$ {signed_amt:9,.2f} | Desc: {e['description']}")
    print(f"Total EXCEL Group 06 sum: R$ {sum_excel_06:,.2f}")

if __name__ == '__main__':
    main()
