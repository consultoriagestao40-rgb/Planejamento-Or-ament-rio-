import urllib.request
import json
import urllib.error
import http.cookiejar

def main():
    login_url = "https://planejamento-or-ament-rio.vercel.app/api/auth/internal-login"
    dashboard_url = "https://planejamento-or-ament-rio.vercel.app/"
    
    # Setup cookie handler
    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    urllib.request.install_opener(opener)
    
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
    
    print(f"Logando em {login_url}...")
    try:
        with opener.open(req_login) as response:
            print(f"Login Status: {response.status}")
            print("Cookies set:")
            for cookie in cj:
                print(f"  {cookie.name} = {cookie.value[:20]}... (secure={cookie.secure}, domain={cookie.domain})")
    except Exception as e:
        print(f"Erro no login: {e}")
        return

    # Fetch dashboard
    req_dash = urllib.request.Request(
        dashboard_url,
        headers={
            'User-Agent': 'Mozilla/5.0'
        }
    )
    print(f"\nBuscando dashboard em {dashboard_url}...")
    try:
        with opener.open(req_dash) as response:
            print(f"Dashboard Status: {response.status}")
            html = response.read().decode('utf-8')
            print(f"Tamanho do HTML: {len(html)} bytes")
            print("Primeiros 1000 caracteres:")
            print(html[:1000])
    except urllib.error.HTTPError as e:
        print(f"Erro HTTP ao buscar dashboard: {e.code}")
        print(e.read().decode('utf-8'))
    except Exception as e:
        print(f"Erro ao buscar dashboard: {e}")

if __name__ == '__main__':
    main()
