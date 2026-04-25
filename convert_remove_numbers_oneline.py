import re
from pathlib import Path

# Prefer original backup if present, otherwise use current CSV
root = Path(__file__).parent
bak = root / 'recipe_names.csv.bak'
src = bak if bak.exists() else root / 'recipe_names.csv'
output_oneline = root / 'recipe_names_clean_oneline.txt'

if not src.exists():
    print('Source file not found:', src)
    raise SystemExit(1)

def normalize(line):
    s = line.strip()
    if not s:
        return None
    if s.endswith(','):
        s = s[:-1]
    # remove surrounding non-alphanumeric/quote characters
    s = re.sub(r'^\W+|\W+$', ' ', s).strip()
    if not s:
        return None
    parts = s.split()
    # drop last token if it's all digits
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
        entries.append(f'"{nm}",' )

# join entries with a space so they appear one after another on one line
one_line = ' '.join(entries)
output_oneline.write_text(one_line + '\n', encoding='utf-8')
print(f'Wrote {len(entries)} entries to {output_oneline.resolve()}')

# Backup current recipe_names.csv (if not already backed up) and overwrite
target_csv = root / 'recipe_names.csv'
if not (root / 'recipe_names.csv.bak').exists():
    target_csv.rename(root / 'recipe_names.csv.bak')
    print('Backed up existing recipe_names.csv to recipe_names.csv.bak')
# write the one-line cleaned content to recipe_names.csv
output_oneline_text = output_oneline.read_text(encoding='utf-8')
target_csv.write_text(output_oneline_text, encoding='utf-8')
print(f'Overwrote {target_csv.resolve()} with cleaned single-line content')
