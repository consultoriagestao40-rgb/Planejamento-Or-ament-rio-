import urllib.request
import json
import time

def check_category(uuid, label):
    timestamp = int(time.time())
    base_url = 'https://planejamento-or-ament-rio.vercel.app/api/kpi/detailed-chart-data'
    url = f'{base_url}?categoryId={uuid}&filterTenantId=ALL&filterCCId=ALL&year=2026&viewMode=competencia&t={timestamp}'
    
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=15) as response:
            data = json.loads(response.read().decode('utf-8'))
            if not data.get('success'):
                print(f'{label} ({uuid}): ERRO: {data.get("error")}')
            else:
                m1 = data['data'][0] if data['data'] else {}
                print(f'{label} ({uuid}): R$ {m1.get("realized", 0):,.2f}')
                for bk, bv in m1.get('breakdown', {}).items():
                    print(f'  breakdown[{bk[:8]}...]: R$ {bv["realized"]:,.2f}')
    except Exception as e:
        print(f'{label} ({uuid}): FAILED: {e}')

def main():
    print("Waiting 10 seconds for Vercel deployment to initialize...")
    time.sleep(10)
    
    print("\n=== VERIFYING DETAILED CHART DATA FIX ===")
    
    # 8bbf7292 is the 03.4.2 category from tenant 0013c839
    check_category('8bbf7292-2181-4898-aad3-b2c00401b997', 'Category 03.4.2 (tenant 0013c839)')
    
    # c7a31d42 is the 03.4.2 category from tenant 413f88a7
    check_category('c7a31d42-bd04-4f76-9dfa-d561b7c0cebf', 'Category 03.4.2 (tenant 413f88a7)')
    
    # 03.4.1 category (184e5b87)
    check_category('184e5b87-77df-4eae-942c-840a58a15f05', 'Category 03.4.1 (tenant 413f88a7)')

if __name__ == '__main__':
    main()
