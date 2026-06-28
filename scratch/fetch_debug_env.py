import urllib.request
import json
import urllib.error

def main():
    url = "https://planejamento-or-ament-rio.vercel.app/api/debug-env"
    req = urllib.request.Request(
        url, 
        headers={'User-Agent': 'Mozilla/5.0'}
    )
    print(f"Buscando {url}...")
    try:
        with urllib.request.urlopen(req) as response:
            print(f"Status: {response.status}")
            body = response.read().decode('utf-8')
            print("Response body:")
            try:
                # Try formatting JSON nicely
                parsed = json.loads(body)
                print(json.dumps(parsed, indent=2))
            except:
                print(body)
    except urllib.error.HTTPError as e:
        print(f"HTTP Error: {e.code}")
        body = e.read().decode('utf-8')
        print("Response body:")
        print(body)
    except Exception as e:
        print(f"Erro geral: {e}")

if __name__ == '__main__':
    main()
