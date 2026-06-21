import urllib.request

def main():
    url = "https://planejamento-or-ament-rio.vercel.app/api/setup"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req) as response:
            print("Status:", response.status)
            body = response.read().decode('utf-8')
            print("Body (first 1000 chars):")
            print(body[:1000])
    except Exception as e:
        print("Error:", e)

if __name__ == '__main__':
    main()
