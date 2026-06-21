import urllib.request
import json
import urllib.parse

def fetch_url(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return None

def main():
    tenants = [
        {"name": "CONSOLIDADO", "id": "all"},
        {"name": "JVS TRATMENTOS", "id": "0013c839-93bb-472d-ba64-092c89e1cacf"},
        {"name": "JVS FACILITIES", "id": "dc2b6eed-a38a-43c3-9465-ce854bfda90f"},
    ]

    for t in tenants:
        print(f"\n======================================")
        print(f"Tenant: {t['name']} ({t['id']})")
        print(f"======================================")
        url = f"https://planejamento-or-ament-rio.vercel.app/api/dfc?tenantId={t['id']}&year=2026&defaultRate=0&overdueAction=today"
        res = fetch_url(url)
        if res and res.get('success'):
            print(f"Success: True")
            print(f"Current Bank Balance: R$ {res.get('currentBankBalance', 0):,.2f}")
            
            # Count and sum realized and expected entries in the details
            realized_inflows = 0.0
            realized_outflows = 0.0
            expected_inflows = 0.0
            expected_outflows = 0.0
            
            expected_details = []
            for m in res.get('monthlyData', []):
                for d in m.get('details', []):
                    if d.get('isRealized'):
                        if d.get('isRevenue'):
                            realized_inflows += d.get('amount', 0)
                        else:
                            realized_outflows += d.get('amount', 0)
                    else:
                        expected_details.append(d)
                        if d.get('isRevenue'):
                            expected_inflows += d.get('amount', 0)
                        else:
                            expected_outflows += d.get('amount', 0)
                            
            print(f"Realized Inflows: R$ {realized_inflows:,.2f}")
            print(f"Realized Outflows: R$ {realized_outflows:,.2f}")
            print(f"Expected Inflows (Recebimentos em Aberto): R$ {expected_inflows:,.2f}")
            print(f"Expected Outflows (Pagamentos em Aberto): R$ {expected_outflows:,.2f}")
            
            # Check length of daily projection
            daily = res.get('dailyProjection', [])
            print(f"Daily Projection points: {len(daily)}")
            if daily:
                print(f"First day balance: R$ {daily[0]['balance']:,.2f}")
                print(f"Last day balance: R$ {daily[-1]['balance']:,.2f}")
            
            print(f"\nExpected Entries Sample (first 5):")
            for e in expected_details[:5]:
                print(f"  Date: {e.get('date')} | Amt: R$ {e.get('amount'):,.2f} | Rev: {e.get('isRevenue')} | Cust: {e.get('customer')} | Desc: {e.get('description')}")
        else:
            print("Failed to fetch.")

if __name__ == '__main__':
    main()
