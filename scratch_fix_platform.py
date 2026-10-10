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

    # Check if Platform is imported
    if 'import { Platform' not in content and 'Platform,' not in content and 'Platform }' not in content:
        # We need to add Platform to react-native imports
        # Search for `import { ..., View, Text` or similar from 'react-native'
        import_stmt_start = content.find("from 'react-native'")
        if import_stmt_start != -1:
            # find the opening brace before it
            brace_start = content.rfind("{", 0, import_stmt_start)
            if brace_start != -1:
                content = content[:brace_start+1] + " Platform, " + content[brace_start+1:]
        else:
            content = "import { Platform } from 'react-native';\n" + content

        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Added Platform import to {file_path}")

