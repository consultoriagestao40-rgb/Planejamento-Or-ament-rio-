import urllib.request
import json
import time

def main():
    url = "https://planejamento-or-ament-rio.vercel.app/api/debug-env"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    
    print("Aguardando início do build na Vercel...")
    # Wait 20 seconds for the build to finish (Vercel builds are usually fast, around 30-45 seconds)
    time.sleep(20)
    
    print("Verificando se o deploy está pronto...")
    for i in range(12): # Try for 2 minutes max
        try:
            with urllib.request.urlopen(req) as response:
                body = response.read().decode('utf-8')
                parsed = json.loads(body)
                print(f"Deploy status check {i+1}: Success!")
                print(json.dumps(parsed, indent=2))
                break
        except Exception as e:
            print(f"Check {i+1}: Vercel site is building or returning error: {e}")
            time.sleep(10)

if __name__ == '__main__':
    main()
