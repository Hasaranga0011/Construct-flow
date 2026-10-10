import os
import re

search_dir = r'D:\PROJECTS\Construct-flow\frontend\src'

results = []
for root, _, files in os.walk(search_dir):
    for f in files:
        if f.endswith('.tsx') or f.endswith('.ts'):
            path = os.path.join(root, f)
            with open(path, 'r', encoding='utf-8') as file:
                lines = file.readlines()
                for i, line in enumerate(lines):
                    if re.search(r'\{[^\}]*\b(?:role|pm|site_manager)\b[^\}]*\}', line, re.IGNORECASE) or re.search(r'>[^<]*\b(?:pm|site_manager)\b[^<]*<', line, re.IGNORECASE):
                        results.append(f"{path}:{i+1}: {line.strip()}")

with open('scratch_find_roles.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(results))
print(f"Found {len(results)} matches.")
