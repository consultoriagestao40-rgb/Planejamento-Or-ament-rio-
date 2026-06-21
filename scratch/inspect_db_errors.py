import urllib.request
import urllib.parse
import urllib.error

def query_sql(sql):
    encoded_sql = urllib.parse.quote(sql)
    url = f"https://planejamento-or-ament-rio.vercel.app/api/debug-db?action=query-sql&sql={encoded_sql}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req) as response:
            return response.read().decode('utf-8')
    except urllib.error.HTTPError as e:
        print("HTTP Error status:", e.code)
        print("HTTP Error body:", e.read().decode('utf-8'))
        return None
    except Exception as e:
        print(f"Other error: {e}")
        return None

def main():
    sql = """
        SELECT count(*), sum(amount)
        FROM "RealizedEntry"
        WHERE "tenantId" = '0013c839-93bb-472d-ba64-092c89e1cacf' 
          AND "viewMode" = 'previsto_receber'
          AND year = 2026
    """
    query_sql(sql)

if __name__ == '__main__':
    main()
