const fs = require('fs');
const path = require('path');

const filesToFix = [
  'src/app/admin/projects/index.tsx',
  'src/app/admin/projects/create.tsx',
  'src/app/admin/projects/[id].tsx',
  'src/app/admin/projects/[id]/milestones/index.tsx',
  'src/app/admin/projects/[id]/milestones/create.tsx',
  'src/app/admin/projects/[id]/milestones/[milestoneId].tsx',
  'src/app/admin/users/index.tsx',
  'src/app/admin/users/create.tsx',
  'src/app/admin/users/[id].tsx',
  'src/app/admin/users/[id]/edit.tsx',
  'src/app/admin/profile.tsx'
];

const basePath = 'd:/PROJECTS/Construct flow/construct-flow';

filesToFix.forEach(relPath => {
  const fullPath = path.join(basePath, relPath);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    
    // Remove Sidebar import
    content = content.replace(/import { Sidebar } from '.*?Sidebar';\n?/g, '');
    
    // Remove Sidebar component usage
    content = content.replace(/<Sidebar userRole="admin" \/>\s*/g, '');
    
    // The main wrapper was <View className="flex-1 flex-row bg-gray-50">. We can just change it to flex-col, and remove the inner flex-col wrapper.
    // Actually, just leaving it as <View className="flex-1 flex-row bg-gray-50"> without sidebar is fine, but it has flex-row. Let's change it to <View className="flex-1 bg-gray-50">
    content = content.replace(/<View className="flex-1 flex-row bg-gray-50">/g, '<View className="flex-1 bg-gray-50">');
    
    // Fix supabase import path errors
    // Instead of counting manually, replace with absolute alias if possible, or just correct relative path.
    // Expo router usually supports @/ or similar, but let's just do relative correctly.
    // For milestones/index.tsx: it's in src/app/admin/projects/[id]/milestones/
    // To src/lib/supabase: ../../../../../../lib/supabase (6 levels)
    // milestones is 1, [id] is 2, projects is 3, admin is 4, app is 5, src is 6?
    // src/app/admin/projects/[id]/milestones/index.tsx
    // 1: index.tsx -> milestones (dir)
    // 2: milestones -> [id]
    // 3: [id] -> projects
    // 4: projects -> admin
    // 5: admin -> app
    // 6: app -> src
    // 7: src -> lib
    // Actually:
    // . = src/app/admin/projects/[id]/milestones
    // .. = src/app/admin/projects/[id]
    // ../.. = src/app/admin/projects
    // ../../.. = src/app/admin
    // ../../../.. = src/app
    // ../../../../.. = src
    // ../../../../../lib/supabase
    if (relPath.includes('milestones')) {
      content = content.replace(/import \{ supabase \} from '.*?lib\/supabase';/, "import { supabase } from '../../../../../lib/supabase';");
      content = content.replace(/import \{ TopNav \} from '.*?components\/common\/TopNav';/, "import { TopNav } from '../../../../../components/common/TopNav';");
    }

    if (relPath.includes('users/[id]/edit.tsx')) {
      content = content.replace(/import \{ supabase \} from '.*?lib\/supabase';/, "import { supabase } from '../../../../lib/supabase';");
      content = content.replace(/import \{ TopNav \} from '.*?components\/common\/TopNav';/, "import { TopNav } from '../../../../components/common/TopNav';");
    }

    fs.writeFileSync(fullPath, content, 'utf8');
    console.log('Fixed', relPath);
  }
});
