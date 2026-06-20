import urllib.request
import json

def main():
    url = "https://planejamento-or-ament-rio.vercel.app/api/diag-db-query"
    print(f"Fetching summary from {url}...")
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Error: {e}")
        return

    summary = data.get('summary', [])
    print(f"Summary rows: {len(summary)}")
    for row in summary:
        print(f"Year: {row['year']} | Month: {row['month']:<2} | ViewMode: {row['viewMode']:<12} | Count: {row['_count']['id']:<5} | Sum: R$ {row['_sum']['amount']:,.2f}")

if __name__ == '__main__':
    main()
