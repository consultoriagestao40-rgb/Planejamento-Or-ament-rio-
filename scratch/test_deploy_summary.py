import urllib.request
import json
import time

def check_summary():
    url = "https://planejamento-or-ament-rio.vercel.app/api/debug-db?action=test-summary"
    print(f"Waiting for test-summary deploy and querying: {url}")
    
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
            with urllib.request.urlopen(req, timeout=20) as r:
                body = r.read().decode('utf-8', errors='ignore')
                parsed = json.loads(body)
                if parsed.get('success') and 'erastoGroup' in parsed:
                    print("\n🚀 SUCCESS! Deploy is live and returned Erasto grouping summary:")
                    print(json.dumps(parsed['erastoGroup'], indent=2))
                    print("\nAll Groups:")
                    print(", ".join(parsed['allGroupNames']))
                    return True
                else:
                    print(f"[{attempt}/30] Deploying or unexpected response. Retrying in 5s...")
        except Exception as e:
            print(f"[{attempt}/30] Error or still building: {e}")
            
        time.sleep(5)
        
    print("Timeout reached.")
    return False

if __name__ == '__main__':
    check_summary()
