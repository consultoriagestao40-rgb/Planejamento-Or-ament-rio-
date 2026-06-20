import openpyxl

def main():
    try:
        wb = openpyxl.load_workbook('/Users/cristianosilva/BudgetHub/planilha.xlsx', read_only=True)
        ws = wb['Visão Competência']
        
        dates = set()
        for idx, row in enumerate(ws.iter_rows(values_only=True)):
            if idx == 0 or not row:
                continue
            date_str = str(row[0]) if row[0] is not None else ""
            if date_str:
                if '/' in date_str:
                    parts = date_str.split('/')
                    if len(parts) >= 3:
                        dates.add(f"{parts[1]}/{parts[2]}")
                elif '-' in date_str:
                    parts = date_str.split('-')
                    if len(parts) >= 2:
                        dates.add(f"{parts[0]}-{parts[1]}")
                else:
                    dates.add(date_str[:7])
            if idx >= 10000:
                break
                
        print("Unique months in spreadsheet (up to 10000 rows):")
        for d in sorted(list(dates)):
            print(f"  {d}")
            
    except Exception as e:
        print("Error:", e)

if __name__ == '__main__':
    main()
