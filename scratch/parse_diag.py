import json

LOG_PATH = '/Users/cristianosilva/.gemini/antigravity/brain/d810c21a-d00a-4b66-956b-7370558dc6f3/.system_generated/tasks/task-3350.log'

def main():
    print("=== Parsing Live DB Diagnostic Log ===")
    with open(LOG_PATH, 'r', encoding='utf-8') as f:
        content = f.read().strip()
    
    # The output might have some shell wrappers or just the JSON
    # Let's find the first '{' and last '}' to extract JSON
    start_idx = content.find('{')
    end_idx = content.rfind('}')
    if start_idx == -1 or end_idx == -1:
        print("Could not find JSON bounds in log!")
        return

    json_str = content[start_idx:end_idx+1]
    try:
        data = json.loads(json_str)
    except Exception as e:
        print("JSON parse error:", e)
        # Let's print a small snippet to see what it looks like
        print("Snippet:", content[:200])
        return

    print("success:", data.get('success'))
    tenant = data.get('tenant')
    print("Tenant ID:", tenant.get('id'))
    print("Tenant Name:", tenant.get('name'))
    print("Tenant CNPJ:", tenant.get('cnpj'))
    
    entries = data.get('realizedEntries', [])
    print(f"\nTotal realized entries: {len(entries)}")

    # 1. Summarize viewMode and month
    counts = {}
    amounts = {}
    jan_entries = []
    
    for e in entries:
        m = e.get('month')
        vm = e.get('viewMode')
        amt = e.get('amount', 0.0)
        
        key = (m, vm)
        counts[key] = counts.get(key, 0) + 1
        amounts[key] = amounts.get(key, 0.0) + amt
        
        if m == 1: # January
            jan_entries.append(e)

    print("\nSummary by Month and ViewMode:")
    for key in sorted(counts.keys()):
        m, vm = key
        count = counts[key]
        total_amt = amounts[key]
        print(f"- Month {m} ({vm}): {count} entries, Total = R$ {total_amt:,.2f}")

    print(f"\nFound {len(jan_entries)} entries in January:")
    for e in jan_entries[:30]:
        print(f"  - Amt: {e.get('amount')}, VM: {e.get('viewMode')}, Cust: {e.get('customer')}, Desc: {e.get('description')}, Cat: {e.get('categoryName')}, CC: {e.get('costCenterName')}, ExtId: {e.get('externalId')}")

if __name__ == '__main__':
    main()
