with open("src/app/carteira/page.tsx", "r", encoding="utf-8") as f:
    content = f.read()

with open("scratch/mixed_case.tsx", "r", encoding="utf-8") as f:
    mixed_code = f.read()

target = "        case 'VERTICAL_BAR': {"
if target in content:
    new_content = content.replace(target, mixed_code + "\n\n" + target)
    with open("src/app/carteira/page.tsx", "w", encoding="utf-8") as f:
        f.write(new_content)
    print("Successfully restored case 'MIXED'!")
else:
    print("Target string not found!")
