import psycopg2
import json

DATABASE_URL = 'postgresql://postgres.ryfshgnyghzrqrsvjkyz:BudgetHub20250@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require&hostaddr=54.94.90.106'

def main():
    print("Connecting to live database pooler on 6543...")
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        print("Successfully connected!")
        
        cur.execute("SELECT version();")
        print("DB Version:", cur.fetchone())
        
        cur.close()
        conn.close()
    except Exception as e:
        print("Error connecting:", e)

if __name__ == '__main__':
    main()
