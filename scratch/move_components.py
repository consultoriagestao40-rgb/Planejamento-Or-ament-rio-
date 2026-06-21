import os

file_path = "/Users/cristianosilva/BudgetHub/src/app/carteira/page.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

start_marker = "    const DetailedChartCard = ({ chart, onEdit, onDelete, mainMonth, year, viewMode, categories }: { chart: any, onEdit: (c: any) => void, onDelete: (id: string) => void, mainMonth: number, year: number, viewMode: 'caixa' | 'competencia', categories: any[] }) => {"
end_marker = "    const fetchData = useCallback(async () => {"

start_idx = content.find(start_marker)
if start_idx == -1:
    print("Error: Could not find DetailedChartCard start")
    exit(1)

end_idx = content.find(end_marker)
if end_idx == -1:
    print("Error: Could not find fetchData start")
    exit(1)

# Extrai o bloco de código
extracted_code = content[start_idx:end_idx]

# Remove o bloco do local original
new_content_without_code = content[:start_idx] + content[end_idx:]

# Agora acha o fim do componente PortfolioAnalysisPage
# O arquivo termina com:
#             </div>
#         </div>
#     );
# }
# 
# E possivelmente algumas linhas em branco.
# Vamos colocar no final do arquivo, mas precisamos garantir que esteja após a última chave de fechamento.
last_bracket_idx = new_content_without_code.rfind("}")
if last_bracket_idx == -1:
    print("Error: Could not find last closing bracket")
    exit(1)

# Vamos inserir o código extraído logo após o último fechamento de chaves
# Também precisamos remover os 4 espaços de indentação adicionais no início de cada linha para ficar limpo no escopo global
cleaned_lines = []
for line in extracted_code.split("\n"):
    if line.startswith("    "):
        cleaned_lines.append(line[4:])
    else:
        cleaned_lines.append(line)
cleaned_code = "\n".join(cleaned_lines)

final_content = new_content_without_code[:last_bracket_idx+1] + "\n\n" + cleaned_code + "\n" + new_content_without_code[last_bracket_idx+1:]

with open(file_path, "w", encoding="utf-8") as f:
    f.write(final_content)

print("Successfully moved components to the end of the file!")
