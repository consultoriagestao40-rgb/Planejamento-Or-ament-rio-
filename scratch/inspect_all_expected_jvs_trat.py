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
    print("=== EXPECTED RECEIVABLES FOR JVS TRATMENTOS (0013c839-93bb-472d-ba64-092c89e1cacf) ===")
    sql = """
        SELECT r.id, r.amount, r.description, r.customer, r.date, c.name as category_name
        FROM "RealizedEntry" r
        JOIN "Category" c ON r."categoryId" = c.id
        WHERE r."tenantId" = '0013c839-93bb-472d-ba64-092c89e1cacf' 
          AND r."viewMode" = 'previsto_receber'
          AND r.year = 2026
        ORDER BY r.date ASC
    """
    res = query_sql(sql)
    if res:
        print(f"Total found: {len(res)}")
        for r in res:
            print(f"Date: {r['date']} | Amt: R$ {r['amount']:10,.2f} | Cust: {r['customer']:<35} | Desc: {r['description']:<30} | Cat: {r['category_name']}")

if __name__ == '__main__':
    main()
