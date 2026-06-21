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
    print("=== EXPECTED ENTRIES COUNTS BY TENANT ===")
    sql = """
        SELECT "tenantId", t.name, "viewMode", count(*), sum(amount)
        FROM "RealizedEntry" r
        JOIN "Tenant" t ON r."tenantId" = t.id
        WHERE "viewMode" IN ('previsto_receber', 'previsto_pagar') AND year = 2026
        GROUP BY "tenantId", t.name, "viewMode"
    """
    res = query_sql(sql)
    if res:
        for r in res:
            print(f"Tenant: {r['name']:<18} | Mode: {r['viewMode']:<18} | Count: {r['count']:<4} | Sum: R$ {r['sum']:15,.2f}")
    
    print("\n=== EXPECTED ENTRIES DETAILS FOR JVS TRATMENTOS (0013c839-93bb-472d-ba64-092c89e1cacf) ===")
    sql = """
        SELECT r.id, r.amount, r.description, r.customer, r.date, r."viewMode"
        FROM "RealizedEntry" r
        WHERE "tenantId" = '0013c839-93bb-472d-ba64-092c89e1cacf' 
          AND "viewMode" IN ('previsto_receber', 'previsto_pagar')
          AND year = 2026
        LIMIT 20
    """
    res = query_sql(sql)
    if res:
        for r in res:
            print(f"Mode: {r['viewMode']:<18} | Amt: R$ {r['amount']:10,.2f} | Date: {r['date']} | Cust: {r['customer']} | Desc: {r['description']}")

    print("\n=== EXPECTED ENTRIES DETAILS FOR JVS FACILITIES (dc2b6eed-a38a-43c3-9465-ce854bfda90f) ===")
    sql = """
        SELECT r.id, r.amount, r.description, r.customer, r.date, r."viewMode"
        FROM "RealizedEntry" r
        WHERE "tenantId" = 'dc2b6eed-a38a-43c3-9465-ce854bfda90f' 
          AND "viewMode" IN ('previsto_receber', 'previsto_pagar')
          AND year = 2026
        LIMIT 20
    """
    res = query_sql(sql)
    if res:
        for r in res:
            print(f"Mode: {r['viewMode']:<18} | Amt: R$ {r['amount']:10,.2f} | Date: {r['date']} | Cust: {r['customer']} | Desc: {r['description']}")

if __name__ == '__main__':
    main()
