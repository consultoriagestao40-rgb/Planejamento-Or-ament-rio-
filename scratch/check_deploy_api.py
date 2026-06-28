import urllib.request
import time
import json

def check_live():
    url = "https://planejamento-or-ament-rio.vercel.app/api/debug-db?action=refresh-token"
    print(f"Monitoring {url} for new deploy...")
    
    req = urllib.request.Request(
        url, 
        headers={
            'User-Agent': 'Mozilla/5.0',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        }
    )
    
    for attempt in range(1, 30):
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                body = r.read().decode('utf-8', errors='ignore')
                parsed = json.loads(body)
                if parsed.get('success') and 'token' in parsed:
                    print("🚀 NEW DEPLOY IS ONLINE! refresh-token works!")
                    return True
                else:
                    print(f"[{attempt}/30] Old deploy still online (or error). Response length: {len(body)}. Retrying in 5s...")
        except Exception as e:
            print(f"Error on request: {e}")
            
        time.sleep(5)
        
    print("Timeout reached.")
    return False

if __name__ == '__main__':
    check_live()
