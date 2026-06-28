with open("scratch/page_prev.tsx", "r", encoding="utf-8") as f:
    lines = f.readlines()

start = -1
end = -1
for i, line in enumerate(lines):
    if "case 'MIXED':" in line:
        start = i
    elif start != -1 and "case 'VERTICAL_BAR':" in line:
        end = i
        break

if start != -1 and end != -1:
    with open("scratch/mixed_case.tsx", "w", encoding="utf-8") as out:
        out.writelines(lines[start:end])
    print("Successfully wrote scratch/mixed_case.tsx")
else:
    print(f"Failed. start={start}, end={end}")
