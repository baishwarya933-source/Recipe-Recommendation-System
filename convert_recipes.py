import re
from pathlib import Path

input_path = Path(__file__).parent / 'recipe_names.csv'
output_path = Path(__file__).parent / 'recipe_names_formatted.txt'

def normalize_line(line):
    # Remove surrounding whitespace
    s = line.strip()
    if not s:
        return None
    # Remove surrounding commas
    if s.endswith(','):
        s = s[:-1]
    # Remove surrounding quotes (single or double, repeated)
    s = re.sub(r'^\W+|\W+$', ' ', s).strip()
    # Now s should look like: Classic Pulao 8180  OR Classic Pulao
    parts = s.split()
    if not parts:
        return None
    # If last token is all digits, drop it
    if parts[-1].isdigit():
        parts = parts[:-1]
    name = ' '.join(parts).strip()
    return name


def main():
    if not input_path.exists():
        print(f"Input file not found: {input_path}")
        return
    count = 0
    written = 0
    with input_path.open('r', encoding='utf-8', errors='ignore') as fin, output_path.open('w', encoding='utf-8') as fout:
        for i, raw in enumerate(fin, start=1):
            count += 1
            name = normalize_line(raw)
            if not name:
                continue
            formatted = f'("{name} {written+1}",)'
            fout.write(formatted + '\n')
            written += 1
    print(f"Processed lines: {count}, Written entries: {written}")
    print(f"Output saved to: {output_path.resolve()}")

if __name__ == '__main__':
    main()
