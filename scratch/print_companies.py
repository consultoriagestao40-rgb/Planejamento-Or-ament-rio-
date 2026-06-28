import urllib.request
import json
import urllib.error
import http.cookiejar

def main():
    base_url = "https://planejamento-or-ament-rio.vercel.app"
    login_url = f"{base_url}/api/auth/internal-login"
    
    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    urllib.request.install_opener(opener)
    
    # Log in
    data = json.dumps({"email": "admin@budgethub.com", "password": "admin123"}).encode('utf-8')
    req_login = urllib.request.Request(
        login_url, 
        data=data,
        headers={
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0'
        },
        method='POST'
    )
    
    try:
        opener.open(req_login)
    except Exception as e:
        print(f"Erro no login: {e}")
        return

    # Call /api/companies
    url = f"{base_url}/api/companies"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with opener.open(req) as response:
            body = response.read().decode('utf-8')
            parsed = json.loads(body)
            print("Resposta /api/companies:")
            print(json.dumps(parsed, indent=2))
    except Exception as e:
        print(f"Erro ao buscar empresas: {e}")

if __name__ == '__main__':
    main()
