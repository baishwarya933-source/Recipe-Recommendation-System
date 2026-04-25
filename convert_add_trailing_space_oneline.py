import re
from pathlib import Path

root = Path(__file__).parent
bak = root / 'recipe_names.csv.bak'
src = bak if bak.exists() else root / 'recipe_names.csv'
output = root / 'recipe_names_quoted_space.txt'

def normalize(line):
    s = line.strip()
    if not s:
        return None
    if s.endswith(','):
        s = s[:-1]
    s = re.sub(r'^\W+|\W+$', ' ', s).strip()
    parts = s.split()
    if parts and parts[-1].isdigit():
        parts = parts[:-1]
    name = ' '.join(parts).strip()
    return name

entries = []
with src.open('r', encoding='utf-8', errors='ignore') as f:
    for raw in f:
        nm = normalize(raw)
        if not nm:
            continue
        entries.append(f'"{nm} ",' )

one_line = ' '.join(entries)
output.write_text(one_line + '\n', encoding='utf-8')
print(f'Wrote {len(entries)} entries to {output.resolve()}')

# overwrite recipe_names.csv but keep backup
target = root / 'recipe_names.csv'
if not bak.exists() and target.exists():
    target.rename(bak)
    print('Created backup recipe_names.csv.bak')
# write output to recipe_names.csv
target.write_text(one_line + '\n', encoding='utf-8')
print(f'Overwrote {target.resolve()} with trailing-space quoted single-line')
