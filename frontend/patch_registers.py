import re

def patch_file(filepath, title, roles_arr, login_route):
    with open(filepath, 'r') as f:
        c = f.read()

    c = c.replace('Create Account', title)
    c = c.replace('const [showPassword, setShowPassword] = useState(false);', f'const [showPassword, setShowPassword] = useState(false);\n  const [role, setRole] = useState(\'{roles_arr[0]}\');')
    c = c.replace('role: \'client\',', 'role: role,')
    c = c.replace('router.replace(\'/login\');', f'router.replace(\'{login_route}\');')
    c = c.replace('router.push(\'/login\')', f'router.push(\'{login_route}\')')

    roles_str = ', '.join([f"'{r}'" for r in roles_arr])
    role_ui = f'''
            <View className="mb-4">
              <Text className="text-sm font-semibold text-gray-700 mb-2">Role</Text>
              <View className="flex-row gap-2">
                {{[{roles_str}].map((r) => (
                  <Pressable 
                    key={{r}}
                    onPress={{() => setRole(r)}}
                    className={{`flex-1 p-3 rounded-xl border ${{role === r ? 'border-brand-orange bg-orange-50' : 'border-gray-300 bg-gray-50'}} items-center`}}
                  >
                    <Text className={{`font-medium capitalize ${{role === r ? 'text-brand-orange' : 'text-gray-500'}}`}}>
                      {{r.replace('_', ' ')}}
                    </Text>
                  </Pressable>
                ))}}
              </View>
            </View>
'''
    c = re.sub(r'<Text className="text-sm text-gray-500 mb-8">.*?</Text>', role_ui, c)
    with open(filepath, 'w') as f:
        f.write(c)

patch_file('src/app/team-register.tsx', 'Team Registration', ['worker', 'site_manager', 'pm'], '/team-login')
patch_file('src/app/partner-register.tsx', 'Partner Registration', ['client', 'supplier'], '/partner-login')
