import os

path = r'D:\PROJECTS\Construct-flow\frontend\src\app\admin\projects\[id]\index.tsx'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add import
if 'import { roleLabel }' not in content:
    content = content.replace("import { useResponsive } from '../../../../hooks/useResponsive';", 
                              "import { useResponsive } from '../../../../hooks/useResponsive';\nimport { roleLabel } from '../../../../utils/roles';")

# Fix string | string[]
content = content.replace("const fetchProject = async () => {\n      try {\n        if (!id) {",
                          "const fetchProject = async () => {\n      try {\n        const projectId = Array.isArray(id) ? id[0] : id;\n        if (!projectId) {")

content = content.replace(".eq('id', id)", ".eq('id', projectId as string)")
content = content.replace(".eq('project_id', id)", ".eq('project_id', projectId as string)")
content = content.replace("project.id = id;", "project.id = projectId as string;")
content = content.replace("id={id as string}", "id={projectId as string}")
content = content.replace("`/admin/projects/${id}/edit`", "`/admin/projects/${projectId}/edit`")

# Fix property pm and client
content = content.replace("projData.pm = pmData;", "(projData as any).pm = pmData;")
content = content.replace("projData.client = clientData;", "(projData as any).client = clientData;")

# Fix a.profiles?.full_name
content = content.replace("a?.profiles?.full_name", "(a.profiles as any)?.full_name")
content = content.replace("assignment.profiles?.full_name", "(assignment.profiles as any)?.full_name")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated [id]/index.tsx successfully.")
