import openpyxl

def main():
    try:
        wb = openpyxl.load_workbook('/Users/cristianosilva/BudgetHub/planilha.xlsx', data_only=True)
        ws = wb['Visão Competência']
        
        category_sums = {}
        
        # Iterate over all rows starting from row 2 (row 1 is headers)
        row_count = 0
        for r_idx, row in enumerate(ws.iter_rows(values_only=True)):
            if r_idx == 0:
                continue
            
            date_str = str(row[0]) if row[0] is not None else ""
            if '/05/2026' in date_str or '2026-05-' in date_str:
                row_count += 1
                
                # Categoria 1 is Col 14
                cat1 = row[14]
                # Valor na Categoria 1 is Col 15
                val1 = row[15]
                if cat1 and val1 is not None:
                    val1 = float(val1)
                    category_sums[cat1] = category_sums.get(cat1, 0.0) + val1
                    
                # Categoria 2 is Col 68
                if len(row) > 68:
                    cat2 = row[68]
                    val2 = row[69]
                    if cat2 and val2 is not None:
                        val2 = float(val2)
                        category_sums[cat2] = category_sums.get(cat2, 0.0) + val2
                        
        print(f"Total rows for May 2026: {row_count}")
        print("\nSpreadsheet Category Sums for May 2026:")
        
        group_06_sum = 0.0
        for cat, val in sorted(category_sums.items()):
            code = cat.split()[0]
            if code.startswith('06') or code.startswith('6'):
                # isNegatedCode in DRE is code.startsWith('06.1')
                sign = -1 if code.startswith('06.1') else 1
                group_06_sum += sign * val
                print(f"  Category: {cat:<50} | Val: R$ {val:12,.2f} | Signed: R$ {sign*val:12,.2f}")
            else:
                # We can also print other groups for reference
                pass
                
        print(f"\nNet Group 06 Sum from Spreadsheet: R$ {group_06_sum:,.2f}")
        
    except Exception as e:
        print("Error:", e)

if __name__ == '__main__':
    main()
