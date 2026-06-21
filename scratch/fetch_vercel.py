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
    # 1. Fetch setup to see tenants
    setup = fetch_url("https://planejamento-or-ament-rio.vercel.app/api/setup")
    if not setup or not setup.get('success'):
        print("Failed to fetch setup from Vercel.")
        return
    
    print("=== Tenants in Vercel ===")
    tenants = setup.get('tenants', [])
    for t in tenants:
        print(f"Tenant: {t['name']} | ID: {t['id']} | CNPJ: {t['cnpj']}")

    # 2. Fetch DFC for JVS (using the ID from tenants or hardcoded JVS ID)
    jvs_tenant = next((t for t in tenants if 'JVS' in t['name'].upper()), None)
    if jvs_tenant:
        print(f"\nFetching DFC for JVS Tenant: {jvs_tenant['name']} ({jvs_tenant['id']})")
        dfc_url = f"https://planejamento-or-ament-rio.vercel.app/api/dfc?tenantId={jvs_tenant['id']}&year=2026&defaultRate=0&overdueAction=today"
        dfc = fetch_url(dfc_url)
        if dfc and dfc.get('success'):
            print(f"Current Bank Balance: {dfc.get('currentBankBalance')}")
            
            # Count expected inflows/outflows
            inflows_sum = 0.0
            outflows_sum = 0.0
            expected_entries_details = []
            
            for month_data in dfc.get('monthlyData', []):
                for detail in month_data.get('details', []):
                    if not detail.get('isRealized'):
                        expected_entries_details.append(detail)
                        if detail.get('isRevenue'):
                            inflows_sum += detail.get('amount', 0)
                        else:
                            outflows_sum += detail.get('amount', 0)
            
            print(f"Sum of expected inflows (Recebimentos em Aberto): R$ {inflows_sum:,.2f}")
            print(f"Sum of expected outflows (Pagamentos em Aberto): R$ {outflows_sum:,.2f}")
            print(f"Total expected entries count: {len(expected_entries_details)}")
            
            # Print a few expected entries to see their descriptions and years
            print("\nSample expected entries:")
            for e in expected_entries_details[:10]:
                print(f"  Date: {e.get('date')} | Amt: R$ {e.get('amount'):,.2f} | Rev: {e.get('isRevenue')} | Cust: {e.get('customer')} | Desc: {e.get('description')}")
        else:
            print("Failed to fetch DFC.")

if __name__ == '__main__':
    main()
