with open("src/app/carteira/page.tsx", "r", encoding="utf-8") as f:
    lines = f.readlines()

content_range = lines[469:823] # linhas 470 a 823 (0-indexed)

open_braces = 0
close_braces = 0
open_parens = 0
close_parens = 0

for idx, line in enumerate(content_range, 470):
    for char in line:
        if char == "{":
            open_braces += 1
        elif char == "}":
            close_braces += 1
        elif char == "(":
            open_parens += 1
        elif char == ")":
            close_parens += 1

print(f"Total open braces: {open_braces}")
print(f"Total close braces: {close_braces}")
print(f"Braces Diff (open - close): {open_braces - close_braces}")
print(f"Total open parens: {open_parens}")
print(f"Total close parens: {close_parens}")
print(f"Parens Diff (open - close): {open_parens - close_parens}")
