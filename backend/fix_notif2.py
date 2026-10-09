import os, glob, re

def replace_in_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    orig = content
    if 'core.notification_helper' not in content:
        content = content.replace('from core.database import', 'from core.notification_helper import create_notifications\nfrom core.database import')
        if 'from core.notification_helper import' not in content:
            content = 'from core.notification_helper import create_notifications\n' + content

    lines = content.split('\n')
    for i, line in enumerate(lines):
        if 'table("notifications").insert(' in line:
            line = re.sub(r'[\w_]+\.table\("notifications"\)\.insert\(', 'create_notifications(', line)
            line = line.replace(').execute()', ')')
            if 'create_notifications({' in line:
                line = line.replace('create_notifications({', 'create_notifications([{')
            lines[i] = line
            
    content = '\n'.join(lines)
    content = content.replace('}).execute()', '}])')
    content = content.replace('create_notifications({', 'create_notifications([{')
    content = content.replace(']).execute()', '])')
    
    if orig != content:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'Updated {path}')

for folder in ['d:/PROJECTS/Construct-flow/backend/api/*.py', 'd:/PROJECTS/Construct-flow/backend/jobs/*.py']:
    for f in glob.glob(folder):
        replace_in_file(f)
