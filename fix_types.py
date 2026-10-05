import os, re

valid_types = {'material_low', 'delay_risk', 'payroll_due', 'milestone_missed', 'general'}
pattern = re.compile(r'\"type\"\s*:\s*\"([^\"]+)\"')

for root, dirs, files in os.walk('backend'):
    dirs[:] = [d for d in dirs if d not in ('.venv', '__pycache__')]
    for f in files:
        if f.endswith('.py'):
            path = os.path.join(root, f)
            with open(path, 'r', encoding='utf-8') as file:
                content = file.read()
            
            def repl(m):
                typ = m.group(1)
                if typ not in valid_types:
                    if 'late' in typ.lower() or 'delay' in typ.lower(): return '\"type\": \"delay_risk\"'
                    if 'stock' in typ.lower() or 'material' in typ.lower(): return '\"type\": \"material_low\"'
                    if 'payroll' in typ.lower(): return '\"type\": \"payroll_due\"'
                    if 'milestone' in typ.lower(): return '\"type\": \"milestone_missed\"'
                    return '\"type\": \"general\"'
                return m.group(0)
            
            new_content = pattern.sub(repl, content)
            new_content = re.sub(r'\"type\"\s*:\s*\"error\"\s*if[^\"]+\"warning\"', '\"type\": \"general\"', new_content)
            new_content = re.sub(r'\"type\"\s*:\s*\"Success\"', '\"type\": \"general\"', new_content)

            if new_content != content:
                with open(path, 'w', encoding='utf-8') as file:
                    file.write(new_content)
                print(f'Updated {path}')
