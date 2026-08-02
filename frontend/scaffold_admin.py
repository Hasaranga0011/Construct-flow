import os
from pathlib import Path

BASE_DIR = Path(r"d:\PROJECTS\Construct flow\frontend\src\app")

ADMIN_PAGES = [
    "admin/projects/create.tsx",
    "admin/projects/[id]/milestones/index.tsx",
    "admin/projects/[id]/milestones/create.tsx",
    "admin/projects/[id]/milestones/[milestoneId].tsx",
    "admin/users/create.tsx",
    "admin/users/[id]/edit.tsx",
    "admin/users/pms.tsx",
    "admin/users/site-managers.tsx",
    "admin/users/workers.tsx",
    "admin/users/clients.tsx",
    "admin/users/suppliers.tsx",
    "admin/materials/create.tsx",
    "admin/materials/[id].tsx",
    "admin/materials/orders/create.tsx",
    "admin/materials/orders/[id].tsx",
    "admin/materials/stock/index.tsx",
    "admin/materials/stock/[siteId].tsx",
    "admin/suppliers/[id].tsx",
    "admin/suppliers/[id]/orders.tsx",
    "admin/attendance/[siteId].tsx",
    "admin/payroll/[workerId].tsx",
    "admin/payroll/generate.tsx",
    "admin/reports/index.tsx",
    "admin/reports/projects.tsx",
    "admin/reports/materials.tsx",
    "admin/reports/payroll.tsx",
    "admin/profile.tsx",
    "admin/settings.tsx"
]

STUB_TEMPLATE = """import React from 'react';
import {{ View, Text, ScrollView }} from 'react-native';
import {{ TopNav }} from '{rel_path_to_components}common/TopNav';

export default function {component_name}() {{
  return (
    <View className="flex-1 bg-brand-light">
      <TopNav title="{page_title}" showAction={{false}} />
      <ScrollView className="flex-1 p-6">
        <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <Text className="text-xl font-bold text-gray-800">{page_title}</Text>
          <Text className="text-gray-500 mt-2">Page stub generated successfully.</Text>
        </View>
      </ScrollView>
    </View>
  );
}}
"""

def generate_pages():
    for page in ADMIN_PAGES:
        file_path = BASE_DIR / page
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Calculate relative path depth
        depth = len(page.split('/')) - 1
        rel_path = '../' * depth
        
        # Component name from path
        parts = page.replace('.tsx', '').replace('index', '').split('/')
        comp_name = ''.join([p.replace('[', '').replace(']', '').capitalize() for p in parts if p]) + "Page"
        title = ' '.join([p.replace('[', '').replace(']', '').capitalize() for p in parts if p])
        
        content = STUB_TEMPLATE.format(
            rel_path_to_components=rel_path + '../../components/',
            component_name=comp_name,
            page_title=title
        )
        
        with open(file_path, 'w') as f:
            f.write(content)
        print(f"Generated: {page}")

if __name__ == "__main__":
    generate_pages()
