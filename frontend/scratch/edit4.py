import re

with open('src/app/admin/materials/orders/create.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add materialQuery state
content = content.replace(
    "const [selectedMaterial, setSelectedMaterial] = useState<any>(null);",
    "const [selectedMaterial, setSelectedMaterial] = useState<any>(null);\n  const [materialQuery, setMaterialQuery] = useState('');"
)

# 2. Add handleCreateMaterial function
func = """
  const handleCreateMaterial = async () => {
    try {
      const { data, error } = await supabase.from('materials').insert([{ name: materialQuery }]).select().single();
      if (error) throw error;
      setMaterials([...materials, data].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedMaterial(data);
      setMaterialQuery(data.name);
      setShowMaterialDrop(false);
    } catch (err: any) {
      if (Platform.OS === 'web') window.alert(err.message);
      else Alert.alert('Error', err.message);
    }
  };
"""
content = content.replace("const handleSubmit = async () => {", func + "\n  const handleSubmit = async () => {")

# 3. Replace Material Dropdown UI
dropdown_ui_old = """            <View className="relative z-40 mb-4">
              <Pressable 
                onPress={() => { setShowMaterialDrop(!showMaterialDrop); setShowSupplierDrop(false); setShowProjectDrop(false); }}
                className="flex-row justify-between items-center border border-gray-200 rounded-lg px-4 py-3 bg-gray-50"
              >
                <Text className={selectedMaterial ? "text-gray-800" : "text-gray-400"}>
                  {selectedMaterial ? selectedMaterial.name : 'Select material (optional)...'}
                </Text>
                <Ionicons name="chevron-down" size={20} color="#9CA3AF" />
              </Pressable>
              
              {showMaterialDrop && (
                <View className="absolute top-full left-0 right-0 bg-white border border-gray-200 mt-1 rounded-lg shadow-lg max-h-48 z-40">
                  <ScrollView nestedScrollEnabled={true}>
                    {materials.length === 0 ? (
                      <Text className="p-4 text-gray-500">No materials in database.</Text>
                    ) : (
                      materials.map(mat => (
                        <Pressable 
                          key={mat.id} 
                          onPress={() => { setSelectedMaterial(mat); setShowMaterialDrop(false); }}
                          className="px-4 py-3 border-b border-gray-100 hover:bg-gray-50"
                        >
                          <Text className="text-gray-800">{mat.name}</Text>
                        </Pressable>
                      ))
                    )}
                  </ScrollView>
                </View>
              )}
            </View>"""

dropdown_ui_new = """            <View className="relative z-40 mb-4">
              <View className="flex-row justify-between items-center border border-gray-200 rounded-lg bg-gray-50 pr-4">
                <TextInput
                  className="flex-1 px-4 py-3 text-sm text-gray-800"
                  placeholder="Search or type new material..."
                  value={materialQuery}
                  onChangeText={(text) => {
                    setMaterialQuery(text);
                    setShowMaterialDrop(true);
                    setSelectedMaterial(null);
                  }}
                  onFocus={() => {
                     setShowMaterialDrop(true);
                     setShowSupplierDrop(false);
                     setShowProjectDrop(false);
                  }}
                />
                <Ionicons name="chevron-down" size={20} color="#9CA3AF" onPress={() => { setShowMaterialDrop(!showMaterialDrop); setShowSupplierDrop(false); setShowProjectDrop(false); }} />
              </View>
              
              {showMaterialDrop && (
                <View className="absolute top-full left-0 right-0 bg-white border border-gray-200 mt-1 rounded-lg shadow-lg max-h-48 z-40">
                  <ScrollView nestedScrollEnabled={true}>
                    {materials.filter(m => m.name.toLowerCase().includes(materialQuery.toLowerCase())).map(mat => (
                        <Pressable 
                          key={mat.id} 
                          onPress={() => { setSelectedMaterial(mat); setMaterialQuery(mat.name); setShowMaterialDrop(false); }}
                          className="px-4 py-3 border-b border-gray-100 hover:bg-gray-50"
                        >
                          <Text className="text-gray-800">{mat.name}</Text>
                        </Pressable>
                    ))}
                    {materialQuery.trim() !== '' && !materials.some(m => m.name.toLowerCase() === materialQuery.trim().toLowerCase()) && (
                        <Pressable 
                          onPress={handleCreateMaterial}
                          className="px-4 py-3 border-b border-gray-100 bg-orange-50 hover:bg-orange-100 flex-row items-center"
                        >
                          <Ionicons name="add-circle-outline" size={18} color="#F97316" style={{marginRight: 8}} />
                          <Text className="text-brand-orange font-bold">Create "{materialQuery}"</Text>
                        </Pressable>
                    )}
                    {materials.length === 0 && materialQuery.trim() === '' && (
                      <Text className="p-4 text-gray-500">No materials in database. Type to create one.</Text>
                    )}
                  </ScrollView>
                </View>
              )}
            </View>"""

content = content.replace(dropdown_ui_old, dropdown_ui_new)

with open('src/app/admin/materials/orders/create.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
