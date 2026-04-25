import re
from pathlib import Path

input_path = Path(__file__).parent / 'recipe_names.csv'
output_path = Path(__file__).parent / 'recipe_names_quoted.txt'

def normalize_line(line):
    s = line.strip()
    if not s:
        return None
    # Remove trailing comma
    if s.endswith(','):
        s = s[:-1]
    # Remove leading/trailing non-word characters and quotes
    s = re.sub(r'^\W+|\W+$', ' ', s).strip()
    if not s:
        return None
    parts = s.split()
    # Drop last token if it's digits (original numbering)
    if parts and parts[-1].isdigit():
        parts = parts[:-1]
    name = ' '.join(parts).strip()
    return name


def main():
    if not input_path.exists():
        print(f"Input file not found: {input_path}")
        return
    written = 0
    with input_path.open('r', encoding='utf-8', errors='ignore') as fin, output_path.open('w', encoding='utf-8') as fout:
        for raw in fin:
            name = normalize_line(raw)
            if not name:
                continue
            written += 1
            fout.write(f'"{name} {written}",\n')
    print(f"Written entries: {written}")
    print(f"Output: {output_path.resolve()}")

if __name__ == '__main__':
    main()
