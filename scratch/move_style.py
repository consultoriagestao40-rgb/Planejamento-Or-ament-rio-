import os

file_path = "/Users/cristianosilva/BudgetHub/src/app/carteira/page.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Marcador da tag de estilo global
style_block = """                        <style jsx global>{`
                            .hover-row:hover {
                                background-color: rgba(37, 99, 235, 0.02) !important;
                            }
                        `}</style>"""

# Verifica se o bloco de estilo está no final do arquivo
style_pos = content.rfind(style_block)
if style_pos == -1:
    # Tenta achar uma versão com indentação diferente
    style_block_alt = """                        <style jsx global>{`
                            .hover-row:hover {
                                background-color: rgba(37, 99, 235, 0.02) !important;
                            }
                        `}</style>"""
    style_pos = content.rfind(style_block_alt)
    if style_pos == -1:
        print("Error: Could not find style block")
        exit(1)
    else:
        style_block = style_block_alt

# Remove o bloco de estilo do final
content_without_style = content[:style_pos] + content[style_pos + len(style_block):]

# Acha o local para inserção: logo após a primeira tabela consolidada
# Vamos buscar o fechamento da primeira tag </table>
table_marker = "                        </table>"
table_pos = content_without_style.find(table_marker)
if table_pos == -1:
    print("Error: Could not find table_marker")
    exit(1)

insert_pos = table_pos + len(table_marker)

# O estilo deve ser inserido logo após </table>
inserted_style = "\n" + style_block
final_content = content_without_style[:insert_pos] + inserted_style + content_without_style[insert_pos:]

# Grava de volta
with open(file_path, "w", encoding="utf-8") as f:
    f.write(final_content)

print("Successfully moved style block back to the first tab!")
