import urllib.request
import json

def fetch_url(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return None

def main():
    # 1. Fetch tenants
    url = "https://planejamento-or-ament-rio.vercel.app/api/debug-db?action=list-tenants"
    res = fetch_url(url)
    if res and res.get('success'):
        print("=== Tenants in DB ===")
        for t in res.get('tenants', []):
            print(f"Name: {t['name']} | ID: {t['id']} | CNPJ: {t['cnpj']}")
    else:
        print("Failed to fetch tenants:", res)

if __name__ == '__main__':
    main()
