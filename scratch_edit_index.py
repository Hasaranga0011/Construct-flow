import os

path = r'D:\PROJECTS\Construct-flow\frontend\src\app\index.tsx'

with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 1. Update the slProjects
for i, line in enumerate(lines):
    if "https://images.unsplash.com/photo-1486325212027" in line:
        lines[i] = "    { img: 'https://images.unsplash.com/photo-1541888086925-ebbc14b62db4?q=80&w=600&h=400&fit=crop', type: 'Commercial Tower',   name: 'WTC Colombo Expansion',          location: 'Colombo 01',           budget: 'LKR 4.2Bn' },\n"
    elif "https://images.unsplash.com/photo-1503387762-592deb58ef4e" in line:
        lines[i] = "    { img: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?q=80&w=600&h=400&fit=crop', type: 'Luxury Residential', name: 'Cinnamon Life Residencies',      location: 'Beira Lake, Colombo',  budget: 'LKR 2.8Bn' },\n"
    elif "https://images.unsplash.com/photo-1590486803833-1c5dc8ddd4c8" in line:
        lines[i] = "    { img: 'https://images.unsplash.com/photo-1590486803833-1c5dc8ddd4c8?q=80&w=600&h=400&fit=crop', type: 'Infrastructure',    name: 'Colombo–Kandy Expressway Ph.3', location: 'Kadugannawa, Kandy',   budget: 'LKR 18Bn'  },\n"
    elif "https://images.unsplash.com/photo-1551882547-ff40c0d129df" in line:
        lines[i] = "    { img: 'https://images.unsplash.com/photo-1551882547-ff40c0d129df?q=80&w=600&h=400&fit=crop', type: 'Hospitality',       name: 'Jetwing Galle Fort Hotel',       location: 'Galle Fort',           budget: 'LKR 650M'  },\n"
    elif "https://images.unsplash.com/photo-1517581177682-a085bb7ffb15" in line:
        lines[i] = "    { img: 'https://images.unsplash.com/photo-1517581177682-a085bb7ffb15?q=80&w=600&h=400&fit=crop', type: 'Retail Complex',    name: 'One Galle Face Mall Ph.2',       location: 'Colombo 03',           budget: 'LKR 3.1Bn' },\n"
    elif "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab" in line:
        lines[i] = "    { img: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=600&h=400&fit=crop', type: 'Industrial',        name: 'Hambantota Port Dry Zone',       location: 'Hambantota',           budget: 'LKR 9.4Bn' },\n"

# 2. Update Navbar to NOT be absolute/sticky. Also update the text bold/hover and the logo.
start_idx = -1
end_idx = -1
for i, line in enumerate(lines):
    if "{/* NAVBAR */}" in line:
        start_idx = i
    if start_idx != -1 and "</View>" in line and "className=\"absolute top-full" not in line and "absolute top-0 w-full" not in line and "max-w-7xl" not in line and "w-9 h-9" not in line and "flex-row items-center hidden xl:flex" not in line and "mobileMenuOpen" not in line and "session ?" not in line and "isSm ?" not in line:
        # Just simple heuristics to find the end of the Navbar
        pass
    if "className=\"absolute top-0 w-full z-50 px-6 md:px-10\"" in line:
        lines[i] = line.replace("className=\"absolute top-0 w-full z-50 px-6 md:px-10\"", "className=\"w-full px-6 md:px-10\"")
    
    # Also update logo in navbar
    if "className=\"w-9 h-9 sm:w-11 sm:h-11 bg-brand-orange" in line:
        lines[i] = "            <View className=\"mr-3 flex-shrink-0\">\n"
    if "<MaterialIcons name=\"precision-manufacturing\"" in line:
        lines[i] = "              <Image source={require('../../assets/images/main-logo.png')} style={{ width: 44, height: 44, borderRadius: 10 }} />\n"
        
    # Bold and animate navbar links
    if "className=\"text-gray-300 font-semibold text-base hover:text-white transition-colors\"" in line:
        lines[i] = line.replace("font-semibold text-base hover:text-white transition-colors", "font-extrabold text-base hover:text-white hover:scale-110 transition-transform")

# Move navbar INSIDE scrollview
content = "".join(lines)
# Wait, if I just remove `absolute top-0 z-50` and leave it where it is (outside ScrollView), it will STILL be sticky because the ScrollView is below it!
# To make it scroll away, I must place it inside the ScrollView.
# Let's extract the whole navbar string, remove it, and place it inside ScrollView.
nav_start = content.find("{/* NAVBAR */}")
nav_end_tag = "      </View>\n\n      <ScrollView"
nav_end = content.find(nav_end_tag) + 14 # up to </View>

if nav_start != -1 and nav_end != -1:
    navbar_content = content[nav_start:nav_end]
    content = content[:nav_start] + content[nav_end:]
    # Now insert navbar_content just after `<ScrollView...>`
    scroll_start = content.find("<ScrollView keyboardShouldPersistTaps=\"handled\" ref={scrollRef}")
    scroll_close = content.find(">", scroll_start) + 1
    content = content[:scroll_close] + "\n\n      " + navbar_content + content[scroll_close:]


# 3. Add Back to top button in footer and link footer links.
# Let's find "FOOTER"
footer_start = content.find("{/* FOOTER */}")
if footer_start != -1:
    content = content.replace("hover:text-white cursor-pointer transition-colors\">{link}</Text>", 
                              "hover:text-white cursor-pointer transition-colors\" onPress={() => scrollTo('home')}>{link}</Text>")
    
    # Add scroll to top button
    footer_bottom = content.find("© 2025 ConstructAi")
    btn = """
              <Pressable style={{ minHeight: 44, minWidth: 44, position: 'absolute', right: 0, bottom: 40 }} onPress={() => scrollRef.current?.scrollTo({y: 0, animated: true})} className="bg-brand-orange p-3 rounded-full shadow-lg">
                <Ionicons name="arrow-up" size={24} color="white" />
              </Pressable>
              """
    content = content[:footer_bottom] + btn + content[footer_bottom:]
    
    
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("index.tsx updated!")
