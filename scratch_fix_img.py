import os

path = r'D:\PROJECTS\Construct-flow\frontend\src\app\index.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace Image tags for fixed size
old_view = """<View style={{ width: '100%', aspectRatio: 1.5, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)' }}>
                      <Image source={{ uri: proj.img }} className="w-full h-full" resizeMode="cover" />
                    </View>"""
new_view = """<View style={{ width: '100%', height: 220, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)' }}>
                      <Image source={{ uri: proj.img }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    </View>"""
content = content.replace(old_view, new_view)

# Replace all project images with highly reliable Pexels/Unsplash URLs without query params that could break
sl_projects = """  const slProjects = [
    { img: 'https://images.pexels.com/photos/323780/pexels-photo-323780.jpeg?auto=compress&cs=tinysrgb&w=800', type: 'Commercial Tower',   name: 'WTC Colombo Expansion',          location: 'Colombo 01',           budget: 'LKR 4.2Bn' },
    { img: 'https://images.pexels.com/photos/221502/pexels-photo-221502.jpeg?auto=compress&cs=tinysrgb&w=800', type: 'Luxury Residential', name: 'Cinnamon Life Residencies',      location: 'Beira Lake, Colombo',  budget: 'LKR 2.8Bn' },
    { img: 'https://images.pexels.com/photos/1750538/pexels-photo-1750538.jpeg?auto=compress&cs=tinysrgb&w=800', type: 'Infrastructure',    name: 'Colombo–Kandy Expressway Ph.3', location: 'Kadugannawa, Kandy',   budget: 'LKR 18Bn'  },
    { img: 'https://images.pexels.com/photos/1106476/pexels-photo-1106476.jpeg?auto=compress&cs=tinysrgb&w=800', type: 'Hospitality',       name: 'Jetwing Galle Fort Hotel',       location: 'Galle Fort',           budget: 'LKR 650M'  },
    { img: 'https://images.pexels.com/photos/2732047/pexels-photo-2732047.jpeg?auto=compress&cs=tinysrgb&w=800', type: 'Retail Complex',    name: 'One Galle Face Mall Ph.2',       location: 'Colombo 03',           budget: 'LKR 3.1Bn' },
    { img: 'https://images.pexels.com/photos/236698/pexels-photo-236698.jpeg?auto=compress&cs=tinysrgb&w=800', type: 'Industrial',        name: 'Hambantota Port Dry Zone',       location: 'Hambantota',           budget: 'LKR 9.4Bn' },
  ];"""

# We need to find the existing slProjects block and replace it
import re
pattern = re.compile(r'  const slProjects = \[.*?\];', re.DOTALL)
content = pattern.sub(sl_projects, content)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed!")
