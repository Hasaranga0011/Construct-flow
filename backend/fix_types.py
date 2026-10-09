import os, glob, re

for f in glob.glob('d:/PROJECTS/Construct-flow/backend/api/routes/*.py'):
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    orig = content
    content = re.sub(r"['\"]type['\"]\s*:\s*['\"]info['\"]", '"type": "general"', content)
    content = re.sub(r"['\"]type['\"]\s*:\s*['\"]success['\"]", '"type": "general"', content)
    content = re.sub(r"['\"]type['\"]\s*:\s*['\"]warning['\"]", '"type": "general"', content)
    content = re.sub(r"['\"]type['\"]\s*:\s*['\"]error['\"]", '"type": "general"', content)
    
    if content != orig:
        with open(f, 'w', encoding='utf-8') as file:
            file.write(content)
        print(f'Updated types in {f}')
