from pathlib import Path
import re
root = Path(__file__).parent
bak = root / 'recipe_names.csv.bak'
src = bak if bak.exists() else root / 'recipe_names.csv'
target = root / 'recipe_names_quoted.txt'

if not src.exists():
    print('Source not found:', src)
    raise SystemExit(1)

entries = []
with src.open('r', encoding='utf-8', errors='ignore') as f:
    for raw in f:
        s = raw.strip()
        if not s:
            continue
        if s.endswith(','):
            s = s[:-1]
        s = re.sub(r'^\W+|\W+$', ' ', s).strip()
        parts = s.split()
        if parts and parts[-1].isdigit():
            parts = parts[:-1]
        name = ' '.join(parts).strip()
        if not name:
            continue
        entries.append(f'"{name} ",')

one_line = ' '.join(entries)
# Write to target
target.write_text(one_line + '\n', encoding='utf-8')
print(f'Wrote {len(entries)} entries to {target.resolve()}')
