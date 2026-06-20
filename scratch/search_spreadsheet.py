import csv

def main():
    try:
        print("Searching planilha.csv...")
        with open('/Users/cristianosilva/BudgetHub/planilha.csv', mode='r', encoding='utf-8', errors='ignore') as f:
            reader = csv.reader(f)
            for idx, row in enumerate(reader):
                row_str = " ".join(row)
                if '06T' in row_str or '20501' in row_str or '503' in row_str:
                    print(f"Row {idx}: {row}")
    except Exception as e:
        print("Error reading planilha.csv:", e)

if __name__ == '__main__':
    main()
