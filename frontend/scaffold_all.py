import os
from pathlib import Path

BASE_DIR = Path(r"d:\PROJECTS\Construct flow\frontend\src\app")

PAGES = [
    # PM
    "pm/projects/[id]/milestones/index.tsx",
    "pm/projects/[id]/milestones/[milestoneId].tsx",
    "pm/materials/orders/create.tsx",
    "pm/materials/orders/[id].tsx",
    "pm/materials/stock/[siteId].tsx",
    "pm/team/index.tsx",
    "pm/team/[siteManagerId].tsx",
    "pm/payroll/[workerId].tsx",
    "pm/clients/[id].tsx",
    "pm/profile.tsx",
    "pm/settings.tsx",
    
    # Site Manager
    "site-manager/attendance/[workerId].tsx",
    "site-manager/workers/[id].tsx",
    "site-manager/materials/request.tsx",
    "site-manager/materials/requests/history.tsx",
    "site-manager/milestones/[id].tsx",
    "site-manager/issues/create.tsx",
    "site-manager/issues/[id].tsx",
    "site-manager/profile.tsx",
    "site-manager/settings.tsx",
    
    # Worker
    "worker/salary/[id].tsx",
    "worker/profile.tsx",
    "worker/settings.tsx",
    
    # Supplier
    "supplier/orders/history.tsx",
    "supplier/deliveries/index.tsx",
    "supplier/profile.tsx",
    "supplier/settings.tsx",
    
    # Client
    "client/dashboard.tsx",
    "client/profile.tsx",
    "client/settings.tsx",
    "client/project/index.tsx",
    "client/project/milestones/index.tsx",
    "client/project/milestones/[id].tsx",
    "client/project/map.tsx",
    "client/project/estimates.tsx",
    "client/messages/index.tsx",
    "client/messages/[threadId].tsx",
    "client/notifications.tsx"
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
    for page in PAGES:
        file_path = BASE_DIR / page
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Calculate relative path depth
        depth = len(page.split('/')) - 1
        rel_path = '../' * depth
        
        # Component name from path
        parts = page.replace('.tsx', '').replace('index', '').split('/')
        comp_name = ''.join([p.replace('[', '').replace(']', '').replace('-', '').capitalize() for p in parts if p]) + "Page"
        title = ' '.join([p.replace('[', '').replace(']', '').capitalize() for p in parts if p])
        
        # Do not overwrite if file already exists with real content (except stub content)
        # Actually just overwrite, they are missing.
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
