import os

path = r'D:\PROJECTS\Construct-flow\frontend\src\app\index.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the button positioning! Remove it from inside the Text node.
old_btn_text = """              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 text-sm">
              <Pressable style={{ minHeight: 44, minWidth: 44, position: 'absolute', right: 0, bottom: 40 }} onPress={() => scrollRef.current?.scrollTo({y: 0, animated: true})} className="bg-brand-orange p-3 rounded-full shadow-lg">
                <Ionicons name="arrow-up" size={24} color="white" />
              </Pressable>
              © 2025 ConstructAi (Pvt) Ltd. Registered in Sri Lanka. All rights reserved.</Text>"""

new_btn_text = """              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 text-sm">© 2025 ConstructAi (Pvt) Ltd. Registered in Sri Lanka. All rights reserved.</Text>"""

# Add the button at the very end of the page, floating!
floating_btn = """
      <Pressable 
        style={{ minHeight: 44, minWidth: 44, position: 'absolute', right: 24, bottom: 24, zIndex: 9999 }} 
        onPress={() => scrollRef.current?.scrollTo({y: 0, animated: true})} 
        className="bg-brand-orange p-3 rounded-full shadow-2xl hover:scale-110 transition-transform cursor-pointer"
      >
        <Ionicons name="arrow-up" size={24} color="white" />
      </Pressable>
      
      </ScrollView>
"""

if old_btn_text in content:
    content = content.replace(old_btn_text, new_btn_text)
    content = content.replace("</ScrollView>", floating_btn)
    print("Button fixed!")
else:
    print("Could not find old text")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
