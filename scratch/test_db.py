import os
import psycopg2

def main():
    db_url = None
    if os.path.exists('.env'):
        with open('.env', 'r') as f:
            for line in f:
                if line.startswith('DATABASE_URL=') or line.startswith('POSTGRES_URL='):
                    db_url = line.split('=', 1)[1].strip().strip('"').strip("'")
    
    if not db_url:
        print("DATABASE_URL not found in .env")
        return
        
    try:
        conn = psycopg2.connect(db_url)
        print("Database connection successful!")
        cur = conn.cursor()
        cur.execute("SELECT id, name FROM \"Tenant\"")
        tenants = cur.fetchall()
        print("Tenants:", tenants)
        cur.close()
        conn.close()
    except Exception as e:
        print("Database connection failed:", e)

if __name__ == '__main__':
    main()
