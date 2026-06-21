import re

file_path = "/Users/cristianosilva/BudgetHub/src/app/carteira/page.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Vamos analisar as tags JSX.
# Tags self-closing em JSX terminam com /> (ex: <input ... /> ou <circle ... /> ou <path ... /> ou <line ... />).
# Tags normais abrem com <tag ...> e fecham com </tag>.
# Vamos ignorar comentários JSX: {/* ... */} e comentários de bloco /* ... */ e comentários de linha // ...
# E ignorar literais de string (aspas simples, duplas e backticks).

# Limpeza simples de comentários e strings para evitar falsos positivos
def clean_code(code):
    # Remove comentários JSX {/* ... */}
    code = re.sub(r'\{\/\*.*?\*\/\}/', '', code, flags=re.DOTALL)
    # Remove comentários de bloco /* ... */
    code = re.sub(r'\/\*.*?\*\/', '', code, flags=re.DOTALL)
    # Remove comentários de linha // ...
    code = re.sub(r'\/\/.*?\n', '\n', code)
    # Remove strings
    code = re.sub(r'"([^"\\]|\\.)*"', '""', code)
    code = re.sub(r"'([^'\\]|\\.)*'", "''", code)
    # Remove style jsx global
    code = re.sub(r'<style jsx global>\{`.*?`\}<\/style>', '', code, flags=re.DOTALL)
    return code

cleaned = clean_code(content)

# Encontra todas as tags JSX
# Uma tag JSX começa com < e opcionalmente / e depois o nome da tag
tag_pattern = re.compile(r'<(\/?[a-zA-Z0-9:]+)([^>]*?)>')

stack = []
errors = []

# Alguns elementos JSX podem ser self-closing mesmo sem /> se forem tags HTML padrão conhecidas,
# mas em TSX/JSX tudo que não tem tag de fechamento DEVE ser self-closing com />.
# Portanto, qualquer tag que não termine com / deve ser empilhada, exceto se for tag de fechamento (começa com /).

for match in tag_pattern.finditer(cleaned):
    tag_name = match.group(1)
    tag_attrs = match.group(2).strip()
    
    # Se a tag termina com / (self-closing)
    if tag_attrs.endswith('/'):
        continue
    
    # Ignorar fragmentos como <> e </> (vamos tratar separadamente)
    if tag_name == '' or tag_name == '/':
        continue
        
    # Se for tag de fechamento
    if tag_name.startswith('/'):
        real_name = tag_name[1:]
        if not stack:
            errors.append(f"Tag de fechamento órfã: {match.group(0)}")
        else:
            last = stack.pop()
            if last != real_name:
                errors.append(f"Incompatibilidade de tag: abriu <{last}>, tentou fechar com {match.group(0)}")
    else:
        # É tag de abertura
        stack.append(tag_name)

print("Análise de Tags JSX concluída!")
if errors:
    print("Erros encontrados:")
    for err in errors:
        print("  -", err)
else:
    print("Nenhum erro de tag encontrado!")
    print("Pilha final de tags abertas:", stack)
