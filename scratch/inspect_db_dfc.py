import urllib.request
import json
import urllib.parse

def query_sql(sql):
    encoded_sql = urllib.parse.quote(sql)
    url = f"https://planejamento-or-ament-rio.vercel.app/api/debug-db?action=query-sql&sql={encoded_sql}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req) as response:
            res = json.loads(response.read().decode('utf-8'))
            if res.get('success'):
                return res.get('result')
            else:
                print("Query error:", res.get('error'))
                return None
    except Exception as e:
        print(f"HTTP error: {e}")
        return None

def main():
    print("=== BANK ACCOUNTS IN DATABASE ===")
    sql = """
        SELECT b.id, b.name, b.balance, t.name as tenant_name
        FROM "BankAccount" b
        JOIN "Tenant" t ON b."tenantId" = t.id
    """
    res = query_sql(sql)
    if res:
        for r in res:
            print(f"Tenant: {r['tenant_name']:<18} | Account: {r['name']:<25} | Balance: R$ {r['balance']:15,.2f}")

    print("\n=== EXPECTED SUMS BY TENANT (2026) ===")
    # Query sums for previsto_receber
    sql = """
        SELECT t.name as tenant_name, sum(amount) as sum_receber
        FROM "RealizedEntry" r
        JOIN "Tenant" t ON r."tenantId" = t.id
        WHERE r."viewMode" = 'previsto_receber' AND r.year = 2026
        GROUP BY t.name
    """
    res = query_sql(sql)
    if res:
        print("\nExpected Receivables:")
        for r in res:
            print(f"  Tenant: {r['tenant_name']:<18} | Sum: R$ {r['sum_receber']:15,.2f}")

    # Query sums for previsto_pagar
    sql = """
        SELECT t.name as tenant_name, sum(amount) as sum_pagar
        FROM "RealizedEntry" r
        JOIN "Tenant" t ON r."tenantId" = t.id
        WHERE r."viewMode" = 'previsto_pagar' AND r.year = 2026
        GROUP BY t.name
    """
    res = query_sql(sql)
    if res:
        print("\nExpected Payables:")
        for r in res:
            print(f"  Tenant: {r['tenant_name']:<18} | Sum: R$ {r['sum_pagar']:15,.2f}")

if __name__ == '__main__':
    main()
