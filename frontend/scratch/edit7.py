import re

with open('src/app/admin/materials/orders/[id].tsx', 'r', encoding='utf-8') as f:
    c = f.read()

# Add ChatWidget import
if "import { ChatWidget }" not in c:
    c = c.replace(
        "import { api } from '../../../../services/api';",
        "import { api } from '../../../../services/api';\nimport { ChatWidget } from '../../../../components/shared/ChatWidget';"
    )

# Get current user inside the component
if "const [currentUserId, setCurrentUserId] = useState('');" not in c:
    c = c.replace(
        "const [actionLoading, setActionLoading] = useState(false);",
        "const [actionLoading, setActionLoading] = useState(false);\n  const [currentUserId, setCurrentUserId] = useState('');\n  useEffect(() => { supabase.auth.getSession().then(({data}) => setCurrentUserId(data.session?.user.id || '')); }, []);"
    )

# Add ChatWidget to UI
ui_insertion = """            {/* Action Buttons Section */}"""
ui_replacement = """          {/* Chat Section */}
          {order.project_id && currentUserId && (
            <View className="mb-6">
              <ChatWidget 
                projectId={order.project_id} 
                currentUserId={currentUserId} 
                currentUserRole="site_manager" 
                targetRole="supplier" 
              />
            </View>
          )}

          {/* Action Buttons Section */}"""
if "Chat Section" not in c:
    c = c.replace(ui_insertion, ui_replacement)

with open('src/app/admin/materials/orders/[id].tsx', 'w', encoding='utf-8') as f:
    f.write(c)
