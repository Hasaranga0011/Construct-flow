import os, glob, re

def replace_in_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # If already using create_notifications, skip
    if 'create_notifications' in content and 'table("notifications").insert' not in content:
        return

    orig = content
    # import create_notifications
    if 'core.notification_helper' not in content:
        content = content.replace('from core.database import', 'from core.notification_helper import create_notifications, create_notification\nfrom core.database import')
        if 'from core.notification_helper import' not in content:
            content = 'from core.notification_helper import create_notifications, create_notification\n' + content

    # Replace insert(dict).execute()
    # It might be multiline for the dict. Let's just find `.table("notifications").insert(` and try to parse it.
    
    # Simple regex replacing `admin_supabase.table("notifications").insert(X).execute()`
    # but X could be anything, even containing parenthesis.
    
    # We can just replace:
    # 1. `admin_supabase.table("notifications").insert(` -> `create_notifications(`
    # 2. `supabase.table("notifications").insert(` -> `create_notifications(`
    # 3. `client.table("notifications").insert(` -> `create_notifications(`
    # And then we need to remove the trailing `.execute()` on those lines.

    lines = content.split('\n')
    for i, line in enumerate(lines):
        if 'table("notifications").insert(' in line:
            # We want to replace the `x.table("notifications").insert(` with `create_notifications(`
            line = re.sub(r'[\w_]+\.table\("notifications"\)\.insert\(', 'create_notifications(', line)
            # Remove `.execute()` at the end
            line = line.replace(').execute()', ')')
            # If inserting a dict, we wrap it in a list so create_notifications handles it.
            # create_notifications({ ... }) -> create_notifications([{ ... }])
            if 'create_notifications({' in line:
                line = line.replace('create_notifications({', 'create_notifications([{')
                # need to find the matching closing bracket, which might be on another line.
                # Actually, `create_notifications([` is safer. Let's just use `create_notification` for dicts?
                # For this simple script, let's just do it manually via regex if it's single line.
            lines[i] = line
            
    # For multiline inserts like purchase_orders.py:
    # admin_supabase.table("notifications").insert({
    #       ...
    # }).execute()
    
    content = '\n'.join(lines)
    content = content.replace('}).execute()', '}])')
    content = content.replace('create_notifications({', 'create_notifications([{')
    
    # Array multiline inserts:
    # admin_supabase.table("notifications").insert([
    #       ...
    # ]).execute()
    content = content.replace(']).execute()', '])')
    
    if orig != content:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {path}")

for f in glob.glob('d:/PROJECTS/Construct-flow/backend/api/routes/*.py'):
    replace_in_file(f)
