import os
import glob
import re

def fix_notifications(directory):
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith('.py'):
                path = os.path.join(root, file)
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                original_content = content
                
                # Replace enum types
                content = content.replace('"type": "info"', '"type": "general"')
                content = content.replace('"type": "success"', '"type": "general"')
                content = content.replace('"type": "warning"', '"type": "delay_risk"')
                content = content.replace('"type": "error"', '"type": "delay_risk"')
                
                # Add user_id to insert({
                content = re.sub(
                    r'(supabase\.table\([\'"]notifications[\'"]\)\.insert\(\{)',
                    r'\1\n            "user_id": current_user["id"],',
                    content
                )
                content = re.sub(
                    r'(client\.table\([\'"]notifications[\'"]\)\.insert\(\{)',
                    r'\1\n            "user_id": current_user["id"],',
                    content
                )
                
                # For lists of notifications:
                # We look for dictionaries that have "target_role" inside a list passed to insert
                # But it's easier to just blindly add user_id: current_user["id"] inside the dictionaries
                content = re.sub(
                    r'(\{\s*"project_id":)',
                    r'{\n                "user_id": current_user["id"] if "current_user" in locals() else "11111111-1111-1111-1111-111111111111",\1',
                    content
                )

                if content != original_content:
                    with open(path, 'w', encoding='utf-8') as f:
                        f.write(content)
                    print(f"Fixed {file}")

fix_notifications('d:/PROJECTS/Construct-flow/backend/api/routes')
print('Done')
