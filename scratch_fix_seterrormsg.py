import os

auth_files = [
    r'D:\PROJECTS\Construct-flow\frontend\src\app\team-register.tsx',
    r'D:\PROJECTS\Construct-flow\frontend\src\app\partner-register.tsx',
    r'D:\PROJECTS\Construct-flow\frontend\src\app\team-login.tsx',
    r'D:\PROJECTS\Construct-flow\frontend\src\app\partner-login.tsx',
    r'D:\PROJECTS\Construct-flow\frontend\src\app\admin-login.tsx'
]

for file_path in auth_files:
    if not os.path.exists(file_path):
        continue
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Change setErrorMsg(null) to setErrorMsg('')
    if 'setErrorMsg(null)' in content:
        content = content.replace("setErrorMsg(null)", "setErrorMsg('')")
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Fixed setErrorMsg in {file_path}")
