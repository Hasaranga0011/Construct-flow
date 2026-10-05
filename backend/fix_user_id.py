import os
import re

def fix_notifications(directory):
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith('.py'):
                path = os.path.join(root, file)
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                original_content = content
                
                # We need to find dictionaries containing "project_id", "title" and insert user_id.
                # A simple regex to find "project_id": ... inside something that looks like a notification:
                # We can just look for "target_role" or "title" in the same dict, but simpler:
                # Replace '            "project_id":' with '            "user_id": "11111111-1111-1111-1111-111111111111",\n            "project_id":'
                # ONLY if it's followed soon by "target_role" or "title" or "type" (i.e. it's a notification)
                # It's safer to just iterate through all matches of project_id and if the block has "target_role", replace it.
                
                # Split content by lines, if we see "project_id" and within next 6 lines we see "target_role" or "title", insert "user_id".
                lines = content.split('\n')
                new_lines = []
                for i, line in enumerate(lines):
                    if '"project_id":' in line and 'user_id' not in line:
                        # check next 7 lines for target_role or title or type
                        is_notif = False
                        for j in range(1, min(8, len(lines) - i)):
                            if '"target_role"' in lines[i+j] or '"title"' in lines[i+j] or '"type"' in lines[i+j]:
                                # But wait, projects and materials also have project_id, but they don't have target_role or title usually.
                                if '"target_role"' in lines[i+j] or '"message"' in lines[i+j]:
                                    is_notif = True
                                    break
                        if is_notif:
                            indent = line[:len(line) - len(line.lstrip())]
                            new_lines.append(f'{indent}"user_id": "11111111-1111-1111-1111-111111111111",')
                    new_lines.append(line)
                
                content = '\n'.join(new_lines)

                if content != original_content:
                    with open(path, 'w', encoding='utf-8') as f:
                        f.write(content)
                    print(f"Fixed {file}")

fix_notifications('d:/PROJECTS/Construct-flow/backend/api/routes')
print('Done')
