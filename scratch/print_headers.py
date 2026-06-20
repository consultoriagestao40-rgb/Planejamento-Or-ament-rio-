import openpyxl

def main():
    try:
        wb = openpyxl.load_workbook('/Users/cristianosilva/BudgetHub/planilha.xlsx', read_only=True)
        ws = wb['Visão Competência']
        for r in ws.iter_rows(values_only=True):
            print("Columns count:", len(r))
            for idx, col in enumerate(r):
                print(f"  Col {idx}: {col}")
            break
    except Exception as e:
        print("Error:", e)

if __name__ == '__main__':
    main()
