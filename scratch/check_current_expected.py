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
    # Target: JVS TRATMENTOS (0013c839-93bb-472d-ba64-092c89e1cacf)
    # Today is June 21, 2026
    
    print("=== JVS TRATMENTOS EXPECTED RECEIVABLES UP TO JUNE 30, 2026 ===")
    sql = """
        SELECT sum(amount) as sum
        FROM "RealizedEntry"
        WHERE "tenantId" = '0013c839-93bb-472d-ba64-092c89e1cacf'
          AND "viewMode" = 'previsto_receber'
          AND date <= '2026-06-30T23:59:59.999Z'
    """
    res = query_sql(sql)
    if res:
        print("Sum:", res[0].get('sum'))

    print("\n=== JVS TRATMENTOS EXPECTED PAYABLES UP TO JUNE 30, 2026 ===")
    sql = """
        SELECT sum(amount) as sum
        FROM "RealizedEntry"
        WHERE "tenantId" = '0013c839-93bb-472d-ba64-092c89e1cacf'
          AND "viewMode" = 'previsto_pagar'
          AND date <= '2026-06-30T23:59:59.999Z'
    """
    res = query_sql(sql)
    if res:
        print("Sum:", res[0].get('sum'))

    print("\n=== JVS TRATMENTOS EXPECTED RECEIVABLES DETAILS UP TO JUNE 30, 2026 ===")
    sql = """
        SELECT date, amount, customer, description
        FROM "RealizedEntry"
        WHERE "tenantId" = '0013c839-93bb-472d-ba64-092c89e1cacf'
          AND "viewMode" = 'previsto_receber'
          AND date <= '2026-06-30T23:59:59.999Z'
    """
    res = query_sql(sql)
    if res:
        for r in res:
            print(f"Date: {r['date']} | Amt: R$ {r['amount']:10,.2f} | Cust: {r['customer']} | Desc: {r['description']}")

    print("\n=== JVS TRATMENTOS EXPECTED PAYABLES DETAILS UP TO JUNE 30, 2026 ===")
    sql = """
        SELECT date, amount, customer, description
        FROM "RealizedEntry"
        WHERE "tenantId" = '0013c839-93bb-472d-ba64-092c89e1cacf'
          AND "viewMode" = 'previsto_pagar'
          AND date <= '2026-06-30T23:59:59.999Z'
    """
    res = query_sql(sql)
    if res:
        for r in res:
            print(f"Date: {r['date']} | Amt: R$ {r['amount']:10,.2f} | Cust: {r['customer']} | Desc: {r['description']}")

if __name__ == '__main__':
    main()
