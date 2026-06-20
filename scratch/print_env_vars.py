import os

def main():
    for k, v in os.environ.items():
        if 'POSTGRES' in k or 'DATABASE' in k or 'PRISMA' in k or 'URL' in k:
            print(f"{k}: {v}")

if __name__ == '__main__':
    main()
