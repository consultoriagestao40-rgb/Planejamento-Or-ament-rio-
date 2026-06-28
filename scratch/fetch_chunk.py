import urllib.request
import urllib.error

def main():
    url = "https://planejamento-or-ament-rio.vercel.app/_next/static/chunks/73df1ba39d853026.js"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    print(f"Lendo chunk: {url}...")
    try:
        with urllib.request.urlopen(req) as response:
            body = response.read().decode('utf-8')
            print(f"Tamanho do chunk: {len(body)} bytes")
            # Print first 2000 chars and search for useCallback
            print("Início do chunk:")
            print(body[:2000])
            
            # Find index of useCallback
            idx = body.find("useCallback")
            if idx != -1:
                print(f"\nEncontrado 'useCallback' na posição {idx}:")
                start = max(0, idx - 100)
                end = min(len(body), idx + 200)
                print(body[start:end])
            else:
                print("\n'useCallback' não encontrado no texto do chunk.")
    except Exception as e:
        print(f"Erro ao ler chunk: {e}")

if __name__ == '__main__':
    main()
