import urllib.request
import json
import urllib.error

def main():
    url = "https://planejamento-or-ament-rio.vercel.app/api/auth/internal-login"
    data = json.dumps({"email": "admin@budgethub.com", "password": "admin123"}).encode('utf-8')
    req = urllib.request.Request(
        url, 
        data=data,
        headers={
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0'
        },
        method='POST'
    )
    print(f"Enviando POST para {url}...")
    try:
        with urllib.request.urlopen(req) as response:
            print(f"Status: {response.status}")
            body = response.read().decode('utf-8')
            print("Response body:")
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
