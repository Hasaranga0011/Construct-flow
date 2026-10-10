import os, glob

files = [
    'team-register.tsx', 'team-login.tsx', 'reset-password.tsx', 
    'partner-register.tsx', 'partner-login.tsx', 'forgot-password.tsx', 
    'admin-login.tsx'
]
base_dir = r'D:\PROJECTS\Construct-flow\frontend\src\app'

for f in files:
    path = os.path.join(base_dir, f)
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as file:
            content = file.read()
        
        # Replace the style width: 100%, aspectRatio: 4 with fixed 80x80 square for the new logo
        # We handle slightly varying spaces
        content = content.replace("style={{ width: '100%', aspectRatio: 4 }}", "style={{ width: 80, height: 80, marginBottom: 16 }}")
        
        with open(path, 'w', encoding='utf-8') as file:
            file.write(content)

print('Updated styles for main logo!')
