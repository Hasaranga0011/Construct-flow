import os
import re

path = r'D:\PROJECTS\Construct-flow\frontend\src\app\index.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update the Image component to support local requires
old_img_tag = '<Image source={{ uri: proj.img }} style={{ width: \'100%\', height: \'100%\' }} resizeMode="cover" />'
new_img_tag = '<Image source={typeof proj.img === \'string\' ? { uri: proj.img } : proj.img} style={{ width: \'100%\', height: \'100%\' }} resizeMode="cover" />'
content = content.replace(old_img_tag, new_img_tag)

# 2. Update slProjects array with the local images you uploaded
sl_projects_replacement = """  const slProjects = [
    { img: require('../../assets/images/projects/proj1.jpg'), type: 'Commercial Tower',   name: 'WTC Colombo Expansion',          location: 'Colombo 01',           budget: 'LKR 4.2Bn' },
    { img: require('../../assets/images/projects/proj2.jpg'), type: 'Luxury Residential', name: 'Cinnamon Life Residencies',      location: 'Beira Lake, Colombo',  budget: 'LKR 2.8Bn' },
    { img: require('../../assets/images/projects/proj3.jpg'), type: 'Infrastructure',    name: 'Colombo–Kandy Expressway Ph.3', location: 'Kadugannawa, Kandy',   budget: 'LKR 18Bn'  },
    { img: require('../../assets/images/projects/proj4.jpg'), type: 'Hospitality',       name: 'Jetwing Galle Fort Hotel',       location: 'Galle Fort',           budget: 'LKR 650M'  },
    { img: require('../../assets/images/projects/proj5.jpg'), type: 'Retail Complex',    name: 'One Galle Face Mall Ph.2',       location: 'Colombo 03',           budget: 'LKR 3.1Bn' },
    { img: require('../../assets/images/projects/proj1.jpg'), type: 'Industrial',        name: 'Hambantota Port Dry Zone',       location: 'Hambantota',           budget: 'LKR 9.4Bn' },
  ];"""

pattern = re.compile(r'  const slProjects = \[.*?\];', re.DOTALL)
content = pattern.sub(sl_projects_replacement, content)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated index.tsx with local images!")
