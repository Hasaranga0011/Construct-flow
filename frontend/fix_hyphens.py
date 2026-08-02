import os
import re
from pathlib import Path

BASE_DIR = Path(r"d:\PROJECTS\Construct flow\frontend\src\app")

def fix_hyphens():
    for root, dirs, files in os.walk(BASE_DIR):
        for file in files:
            if file.endswith(".tsx"):
                file_path = Path(root) / file
                
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Find export default function XYZ-ABCPage()
                # and replace with XYZABCPage
                
                def remove_hyphen(match):
                    func_name = match.group(1)
                    clean_name = func_name.replace('-', '')
                    return f"export default function {clean_name}()"

                new_content = re.sub(r"export default function ([A-Za-z0-9\-]+)\(\)", remove_hyphen, content)
                
                if content != new_content:
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    print(f"Fixed hyphens: {file_path}")

if __name__ == "__main__":
    fix_hyphens()
