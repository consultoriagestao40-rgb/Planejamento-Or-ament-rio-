import urllib.request
import json
import urllib.parse
import urllib.error

def query_sql(sql):
    base_url = "https://planejamento-or-ament-rio.vercel.app/api/debug-db"
    params = urllib.parse.urlencode({
        "action": "query-sql",
        "sql": sql
    })
    url = f"{base_url}?{params}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req) as response:
            body = response.read().decode('utf-8')
            parsed = json.loads(body)
            if parsed.get('success'):
                return parsed.get('result')
            else:
                print(f"Erro na query: {parsed.get('error')}")
                return None
    except Exception as e:
        print(f"Erro ao chamar URL: {e}")
        return None

def main():
    print("--- LENDO USUÁRIOS DO BANCO LIVE ---")
    users = query_sql('SELECT id, name, email, role, "passwordHash" FROM "User"')
    if users:
        for u in users:
            # Mask password hash
            pw_hash = u.get('passwordHash', '')
            masked_hash = pw_hash[:10] + "..." if pw_hash else "None"
            print(f"ID: {u.get('id')} | Nome: {u.get('name')} | Email: {u.get('email')} | Role: {u.get('role')} | Hash: {masked_hash}")
    
    print("\n--- LENDO TENANTS DO BANCO LIVE ---")
    tenants = query_sql('SELECT id, name, cnpj FROM "Tenant"')
    if tenants:
        for t in tenants:
            print(f"ID: {t.get('id')} | Nome: {t.get('name')} | CNPJ: {t.get('cnpj')}")
            
    print("\n--- LENDO ACESSOS ---")
    access = query_sql('SELECT "userId", "tenantId" FROM "UserTenantAccess"')
    if access:
        for a in access:
            print(f"UserId: {a.get('userId')} | TenantId: {a.get('tenantId')}")

if __name__ == '__main__':
    main()
