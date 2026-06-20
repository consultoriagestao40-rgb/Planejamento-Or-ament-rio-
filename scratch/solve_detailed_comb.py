import urllib.request
import json
import random

def solve_randomized(items, target, max_iterations=500000, tolerance=0.1):
    n = len(items)
    print(f"Running randomized solver on {n} items for target {target}...")
    
    # We will try random combinations
    for i in range(max_iterations):
        # Generate a random assignment: for each item, it can be +1, -1, or 0 (excluded)
        choices = [random.choice([1, -1, 0]) for _ in range(n)]
        current_sum = sum(choice * items[idx][1] for idx, choice in enumerate(choices))
        
        if abs(current_sum - target) <= tolerance:
            print(f"FOUND MATCH in iteration {i}!")
            path = []
            for idx, choice in enumerate(choices):
                if choice != 0:
                    sign = '+' if choice == 1 else '-'
                    path.append((items[idx][0], items[idx][1], sign, items[idx][2]))
            return current_sum, path
            
    print("No match found in randomized search.")
    return None

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
    
    sync_entries = [e for e in entries if e.get('externalId', '').startswith('sync-')]
    excel_entries = [e for e in entries if not e.get('externalId', '').startswith('sync-')]
    
    # Extract Group 06 candidates
    sync_candidates = []
    for e in sync_entries:
        code = e['category'].split()[0]
        if code.startswith('06') or code.startswith('6'):
            sync_candidates.append((code, e['amount'], e['description']))
            
    excel_candidates = []
    for e in excel_entries:
        code = e['category'].split()[0]
        if code.startswith('06') or code.startswith('6'):
            excel_candidates.append((code, e['amount'], e['description']))

    print(f"Sync candidates: {len(sync_candidates)}, Excel candidates: {len(excel_candidates)}")
    
    target = 20501.00
    
    print("\n--- Searching Sync Candidates for 20501.00 ---")
    res_sync = solve_randomized(sync_candidates, target)
    if res_sync:
        s, path = res_sync
        print(f"Match: R$ {s:,.2f}")
        for item in path:
            print(f"  {item[2]} {item[0]} (R$ {item[1]:,.2f}) - {item[3]}")
            
    print("\n--- Searching Excel Candidates for 20501.00 ---")
    res_excel = solve_randomized(excel_candidates, target)
    if res_excel:
        s, path = res_excel
        print(f"Match: R$ {s:,.2f}")
        for item in path:
            print(f"  {item[2]} {item[0]} (R$ {item[1]:,.2f}) - {item[3]}")

if __name__ == '__main__':
    main()
