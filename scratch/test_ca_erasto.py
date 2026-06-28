import urllib.request
import json
import urllib.parse

def get_valid_token():
    url = "https://planejamento-or-ament-rio.vercel.app/api/debug-db?action=refresh-token"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req) as response:
            body = response.read().decode('utf-8')
            parsed = json.loads(body)
            if parsed.get('success'):
                return parsed.get('token')
            else:
                print("Failed to get token:", parsed)
                return None
    except Exception as e:
        print("Error getting token:", e)
        return None

def fetch_from_ca(token, endpoint):
    url = f"https://api-v2.contaazul.com{endpoint}"
    req = urllib.request.Request(url, headers={
        'Authorization': f'Bearer {token}',
        'User-Agent': 'Mozilla/5.0'
    })
    try:
        with urllib.request.urlopen(req) as response:
            body = response.read().decode('utf-8')
            return json.loads(body)
    except Exception as e:
        print(f"Error fetching {endpoint}: {e}")
        return None

def main():
    print("Fetching valid refreshed access token...")
    token = get_valid_token()
    if not token:
        print("Could not obtain a valid token.")
        return
    
    erasto_ids = [
        "30345fc4-69ca-11f1-9cef-cb535c10113a", # ERASTO GAETNER (Active)
        "e38bdeb8-b0c0-11ef-913c-2759e039bba0", # ERASTO GAETNER (Inactive)
        "5ee294c0-a5e6-11ef-8521-831ac6abba1c", # IBGE - Erasto Gaetner (Active)
        "12e8fa4a-5fce-11ef-8d21-5359b5a09e54"  # Hospital Erasto Gaertner (Inactive)
    ]
    
    print("\nQUERYING TRANSACTIONS FROM CONTA AZUL FOR JAN-JUN 2026...")
    for is_expense in [False, True]:
        type_str = "contas-a-pagar" if is_expense else "contas-a-receber"
        print(f"\n--- {type_str.upper()} (Jan-Jun 2026) ---")
        
        pagina = 1
        has_more = True
        total_items_checked = 0
        found_matches = []
        
        while has_more:
            url = f"/v1/financeiro/eventos-financeiros/{type_str}/buscar?data_vencimento_de=2023-01-01&data_vencimento_ate=2029-12-31&data_competencia_de=2026-01-01&data_competencia_ate=2026-06-30&tamanho_pagina=100&pagina={pagina}"
            res = fetch_from_ca(token, url)
            if not res:
                break
                
            items = res if isinstance(res, list) else (res.get('itens') or res.get('vendas') or [])
            if len(items) == 0:
                break
                
            total_items_checked += len(items)
            for item in items:
                ccs = item.get('centros_de_custo', [])
                cc_matched = False
                matched_cc_names = []
                for cc in ccs:
                    cc_id = cc.get('id')
                    cc_name = cc.get('nome') or cc.get('name') or ''
                    if cc_id in erasto_ids or 'ERASTO' in cc_name.upper():
                        cc_matched = True
                        matched_cc_names.append(cc_name)
                
                if cc_matched:
                    cats = item.get('categorias', [])
                    cat_names = [c.get('nome') or c.get('name') for c in cats]
                    cc_names_str = ", ".join(matched_cc_names)
                    found_matches.append({
                        'desc': item.get('descricao'),
                        'val': item.get('valor'),
                        'date': item.get('data_competencia'),
                        'ccs': cc_names_str,
                        'cats': cat_names
                    })
            
            if len(items) < 100:
                has_more = False
            else:
                pagina += 1
                
        print(f"Checked {total_items_checked} items.")
        if found_matches:
            print(f"Found {len(found_matches)} transactions matching Erasto Gaetner:")
            for m in found_matches:
                print(f" - {m['desc']} | Val: {m['val']} | Date: {m['date']} | CCs: [{m['ccs']}] | Cats: {m['cats']}")
        else:
            print("No transactions matched Erasto Gaetner.")

if __name__ == '__main__':
    main()
