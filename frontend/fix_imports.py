import os
from pathlib import Path

BASE_DIR = Path(r"d:\PROJECTS\Construct flow\frontend\src\app")

def fix_imports():
    for root, dirs, files in os.walk(BASE_DIR):
        for file in files:
            if file.endswith(".tsx"):
                file_path = Path(root) / file
                
                # Calculate correct relative path to src/components
                # Depth from src/app to current file's directory
                # Example: src/app/admin/projects/create.tsx
                # root = src/app/admin/projects
                # depth = root.relative_to(BASE_DIR) -> admin/projects -> 2 parts
                
                try:
                    rel_to_base = file_path.parent.relative_to(BASE_DIR)
                    depth = len(rel_to_base.parts)
                except ValueError:
                    depth = 0
                
                # To get from root to src/components:
                # We need to go up 'depth' times to reach src/app
                # Then go up 1 more time to reach src
                # Then into components
                ups = '../' * (depth + 1)
                correct_path = f"{ups}components/"
                
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # The script generated `../../../../components/` or similar
                # Let's just find `import {{ TopNav }} from '.*components/common/TopNav';`
                import re
                new_content = re.sub(r"from '.*components/common/TopNav';", f"from '{correct_path}common/TopNav';", content)
                
                if content != new_content:
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    print(f"Fixed: {file_path}")

if __name__ == "__main__":
    fix_imports()
