import urllib.request
import json

def main():
    url = "https://planejamento-or-ament-rio.vercel.app/api/diag-db-query"
    print(f"Fetching budgets from {url}...")
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Error: {e}")
        return

    budgets = data.get('detailedBudgets', [])
    print(f"Total budget entries: {len(budgets)}")
    for b in budgets:
        print(f"  Category: {b['category']:<40} | Amount: R$ {b['amount']:10,.2f} | CostCenter: {b['costCenter']}")

if __name__ == '__main__':
    main()
