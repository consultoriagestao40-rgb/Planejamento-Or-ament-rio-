import urllib.request
import json
import urllib.parse

def main():
    encoded_sql = urllib.parse.quote('SELECT 1')
    url = f"https://planejamento-or-ament-rio.vercel.app/api/debug-db?action=query-sql&sql={encoded_sql}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req) as response:
            res = json.loads(response.read().decode('utf-8'))
            print("Simple query response:", res)
    except Exception as e:
        print("Error:", e)

if __name__ == '__main__':
    main()
