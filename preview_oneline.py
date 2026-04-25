from pathlib import Path
p=Path('recipe_names_oneline.txt')
if not p.exists():
    print('file not found')
else:
    s=p.read_text(encoding='utf-8')
    print('file_len_chars=',len(s))
    print('\nPreview (first 1000 chars):\n')
    print(s[:1000])
