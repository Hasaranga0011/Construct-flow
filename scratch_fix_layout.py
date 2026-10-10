import os

path = r'D:\PROJECTS\Construct-flow\frontend\src\app\index.tsx'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Replace the failed Unsplash URLs with reliable ones
content = content.replace(
    'https://images.unsplash.com/photo-1541888086925-ebbc14b62db4?q=80&w=600&h=400&fit=crop',
    'https://images.unsplash.com/photo-1504307651254-35680f356f27?q=80&w=600&h=400&fit=crop'
)
content = content.replace(
    'https://images.unsplash.com/photo-1551882547-ff40c0d129df?q=80&w=600&h=400&fit=crop',
    'https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?q=80&w=600&h=400&fit=crop'
)

# 2. Enforce strict aspect ratio on the image container so they are ALL the identical size regardless of loading
content = content.replace(
    "<View style={{ height: 200, overflow: 'hidden' }}>",
    "<View style={{ width: '100%', aspectRatio: 1.5, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)' }}>"
)

# 3. Fix the button positioning! Remove it from inside the Text node.
old_btn_text = """              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 text-sm\">
              <Pressable style={{ minHeight: 44, minWidth: 44, position: 'absolute', right: 0, bottom: 40 }} onPress={() => scrollRef.current?.scrollTo({y: 0, animated: true})} className="bg-brand-orange p-3 rounded-full shadow-lg">
                <Ionicons name="arrow-up" size={24} color="white" />
              </Pressable>
              © 2025 ConstructAi (Pvt) Ltd. Registered in Sri Lanka. All rights reserved.</Text>"""

new_btn_text = """              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 text-sm\">© 2025 ConstructAi (Pvt) Ltd. Registered in Sri Lanka. All rights reserved.</Text>"""

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

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed images and button!")
