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
    
    print("Efetuando login...")
    try:
        with opener.open(req_login) as response:
            print(f"Login: {response.status}")
    except Exception as e:
        print(f"Erro no login: {e}")
        return

    # Call /api/companies
    url = f"{base_url}/api/companies"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    company_id = None
    try:
        with opener.open(req) as response:
            body = response.read().decode('utf-8')
            parsed = json.loads(body)
            companies = parsed.get('companies', [])
            print(f"Encontradas {len(companies)} empresas.")
            if companies:
                company_id = companies[0].get('id')
                print(f"ID da primeira empresa: {company_id} ({companies[0].get('name')})")
    except Exception as e:
        print(f"Erro ao buscar empresas: {e}")
        return
        
    if company_id:
        company_endpoints = [
            f"/api/companies/{company_id}",
            f"/api/budgets?costCenterId=ALL&tenantId={company_id}&year=2026",
            f"/api/sync?costCenterId=ALL&tenantId={company_id}&year=2026&viewMode=competencia",
            f"/api/deviations?tenantId={company_id}&year=2026"
        ]
        for path in company_endpoints:
            url = f"{base_url}{path}"
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            print(f"\nChamando API {path}...")
            try:
                with opener.open(req) as response:
                    print(f"Status: {response.status}")
                    body = response.read().decode('utf-8')
                    print(f"Tamanho do body: {len(body)}")
                    try:
                        parsed = json.loads(body)
                        if isinstance(parsed, list):
                            print(f"Retornou lista com {len(parsed)} itens")
                        elif isinstance(parsed, dict):
                            print("Keys retornadas:", list(parsed.keys()))
                            for k, v in parsed.items():
                                if isinstance(v, list):
                                    print(f"  Chave '{k}' tem {len(v)} itens")
                        else:
                            print(str(parsed)[:200])
                    except Exception as je:
                        print("Resposta não é JSON:", je)
                        print(body[:500])
            except urllib.error.HTTPError as e:
                print(f"Erro HTTP {e.code}")
                print(e.read().decode('utf-8')[:500])
            except Exception as e:
                print(f"Erro ao chamar: {e}")

if __name__ == '__main__':
    main()
