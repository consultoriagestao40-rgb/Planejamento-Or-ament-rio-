import subprocess
import time

def main():
    chrome_path = "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta"
    url = "https://planejamento-or-ament-rio.vercel.app/login"
    
    cmd = [
        chrome_path,
        "--headless",
        "--disable-gpu",
        "--enable-logging",
        "--v=1",
        url
    ]
    
    print(f"Running Chrome to fetch {url} and capture logs...")
    try:
        # Run for 8 seconds and terminate
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        time.sleep(8)
        proc.terminate()
        stdout, stderr = proc.communicate()
        
        print("\n--- CHROME STDERR LOGS ---")
        print(stderr)
        print("\n--- CHROME STDOUT LOGS ---")
        print(stdout)
    except Exception as e:
        print(f"Error running Chrome: {e}")

if __name__ == '__main__':
    main()
