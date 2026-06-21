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
    tenants = [
        {"name": "JVS TRATMENTOS", "id": "0013c839-93bb-472d-ba64-092c89e1cacf"},
        {"name": "CLEAN TECH", "id": "1fa165e3-178f-4d8f-ae7c-434c720c82dd"},
        {"name": "SPOT FACILITIES", "id": "413f88a7-ce4a-4620-b044-43ef909b7b26"},
        {"name": "JVS FACILITIES", "id": "dc2b6eed-a38a-43c3-9465-ce854bfda90f"},
    ]

    print("=== EXPECTED RECEIVABLES SUM BY TENANT FOR year = 2026 ===")
    for t in tenants:
        sql = f"""
            SELECT CAST(count(*) as integer) as count, sum(amount) as sum
            FROM "RealizedEntry"
            WHERE "tenantId" = '{t['id']}' 
              AND "viewMode" = 'previsto_receber'
              AND year = 2026
        """
        res = query_sql(sql)
        if res:
            row = res[0]
            count = row.get('count', 0)
            total = row.get('sum', 0.0) or 0.0
            print(f"Tenant: {t['name']:<18} | Count: {count:<4} | Sum: R$ {total:15,.2f}")

    print("\n=== EXPECTED PAYABLES SUM BY TENANT FOR year = 2026 ===")
    for t in tenants:
        sql = f"""
            SELECT CAST(count(*) as integer) as count, sum(amount) as sum
            FROM "RealizedEntry"
            WHERE "tenantId" = '{t['id']}' 
              AND "viewMode" = 'previsto_pagar'
              AND year = 2026
        """
        res = query_sql(sql)
        if res:
            row = res[0]
            count = row.get('count', 0)
            total = row.get('sum', 0.0) or 0.0
            print(f"Tenant: {t['name']:<18} | Count: {count:<4} | Sum: R$ {total:15,.2f}")

if __name__ == '__main__':
    main()
