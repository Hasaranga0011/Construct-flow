import os
path = r'D:\PROJECTS\Construct-flow\frontend\node_modules\jspdf\dist\jspdf.node.min.js'
if os.path.exists(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    new_content = content.replace('require(["html2canvas"], t)', 'null')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('Patched jspdf.node.min.js')
else:
    print('File not found')
