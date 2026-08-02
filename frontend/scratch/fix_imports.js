const fs = require('fs');

const files = [
  'src/app/admin/projects/[id]/milestones/index.tsx',
  'src/app/admin/projects/[id]/milestones/create.tsx',
  'src/app/admin/projects/[id]/milestones/[milestoneId].tsx'
];

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  content = content.replace(/import \{ supabase \} from '.*?lib\/supabase';/g, "import { supabase } from '../../../../../lib/supabase';");
  content = content.replace(/import \{ TopNav \} from '.*?components\/common\/TopNav';/g, "import { TopNav } from '../../../../../components/common/TopNav';");
  content = content.replace(/import \{ Sidebar \} from '.*?components\/common\/Sidebar';/g, "");
  fs.writeFileSync(f, content);
  console.log('Fixed', f);
});
