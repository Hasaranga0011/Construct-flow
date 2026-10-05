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
                
                # Undo the bad regex
                bad_string = '{\n                "user_id": current_user["id"] if "current_user" in locals() else "11111111-1111-1111-1111-111111111111",{'
                content = content.replace(bad_string, '{')
                
                # Undo the first regex which was replacing supabase.table().insert({
                # The first regex did: supabase.table("notifications").insert({\n            "user_id": current_user["id"],
                # Let's remove it and use a cleaner approach.
                content = content.replace('supabase.table("notifications").insert({\n            "user_id": current_user["id"],', 'supabase.table("notifications").insert({')
                content = content.replace('client.table("notifications").insert({\n            "user_id": current_user["id"],', 'client.table("notifications").insert({')

                if content != original_content:
                    with open(path, 'w', encoding='utf-8') as f:
                        f.write(content)
                    print(f"Undone in {file}")

fix_notifications('d:/PROJECTS/Construct-flow/backend/api/routes')
print('Done')
