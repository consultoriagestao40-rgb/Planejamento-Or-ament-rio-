import urllib.request
import json
import urllib.error
import http.cookiejar

def main():
    base_url = "https://planejamento-or-ament-rio.vercel.app"
    login_url = f"{base_url}/api/auth/internal-login"
    carteira_url = f"{base_url}/carteira"
    
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

    # Fetch carteira
    req_dash = urllib.request.Request(carteira_url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with opener.open(req_dash) as response:
            html = response.read().decode('utf-8')
            print(f"Status: {response.status}")
            print(f"Length: {len(html)}")
            print("First 2000 chars of HTML:")
            print(html[:2000])
    except Exception as e:
        print(f"Erro ao buscar carteira: {e}")

if __name__ == '__main__':
    main()
