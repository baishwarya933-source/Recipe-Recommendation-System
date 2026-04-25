import re
from pathlib import Path

input_path = Path(__file__).parent / 'recipe_names.csv'
output_path = Path(__file__).parent / 'recipe_names_oneline.txt'

def normalize_line(line):
    s = line.strip()
    if not s:
        return None
    if s.endswith(','):
        s = s[:-1]
    # strip surrounding non-word chars
    s = re.sub(r'^\W+|\W+$', ' ', s).strip()
    if not s:
        return None
    parts = s.split()
    if parts and parts[-1].isdigit():
        parts = parts[:-1]
    name = ' '.join(parts).strip()
    return name


def main():
    if not input_path.exists():
        print(f"Input file not found: {input_path}")
        return
    entries = []
    with input_path.open('r', encoding='utf-8', errors='ignore') as fin:
        idx = 0
        for raw in fin:
            name = normalize_line(raw)
            if not name:
                continue
            idx += 1
            entries.append(f'"{name} {idx}",')
    # Join with space so they appear one after another
    line = ' '.join(entries)
    with output_path.open('w', encoding='utf-8') as fout:
        fout.write(line + '\n')
    print(f"Written {len(entries)} entries to {output_path.resolve()}")

if __name__ == '__main__':
    main()
