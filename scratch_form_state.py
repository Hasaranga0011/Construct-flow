import os
import re

path = r'D:\PROJECTS\Construct-flow\frontend\src\app\index.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add state imports and variables to the top of the component
import_find = "import React, { useState, useEffect, useRef } from 'react';"
import_replace = "import React, { useState, useEffect, useRef } from 'react';\nimport { supabase } from '../lib/supabase';\nimport { Alert, Platform } from 'react-native';"
if 'import { supabase }' not in content:
    content = content.replace(import_find, import_replace)

component_start = "export default function LandingPage() {"
state_vars = """export default function LandingPage() {
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactProject, setContactProject] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleContactSubmit = async () => {
    if (!contactName || !contactEmail || !contactMessage) {
      if (Platform.OS === 'web') { alert('Please fill in your name, email, and message.'); }
      else { Alert.alert('Missing Fields', 'Please fill in your name, email, and message.'); }
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('public_inquiries').insert([
        { name: contactName, email: contactEmail, project_name: contactProject, message: contactMessage }
      ]);
      if (error) throw error;
      
      if (Platform.OS === 'web') { alert('Message Sent! Our team will get back to you shortly.'); }
      else { Alert.alert('Message Sent', 'Our team will get back to you shortly.'); }
      
      setContactName('');
      setContactEmail('');
      setContactProject('');
      setContactMessage('');
    } catch (e: any) {
      console.error(e);
      if (Platform.OS === 'web') { alert('Failed to send message: ' + e.message); }
      else { Alert.alert('Error', 'Failed to send message. Please try again.'); }
    } finally {
      setIsSubmitting(false);
    }
  };
"""
if 'const [contactName' not in content:
    content = content.replace(component_start, state_vars)

# 2. Update the contact form inputs to use the state
old_form = """                  {['Your Name', 'Email Address', 'Company / Project Name'].map(ph => (
                    <TextInput maxFontSizeMultiplier={1.3} key={ph} placeholder={ph} placeholderTextColor="rgba(156,163,175,0.65)"
                      style={[{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 12, padding: 16, color: '#fff', marginBottom: 14 }, { minHeight: 44, minWidth: 44 }]} />
                  ))}
                  <TextInput maxFontSizeMultiplier={1.3} placeholder="Your message" placeholderTextColor="rgba(156,163,175,0.65)"
                    multiline textAlignVertical="top"
                    style={[{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 12, padding: 16, color: '#fff', height: 120, marginBottom: 14 }, { minHeight: 44, minWidth: 44 }]} />
                  <Pressable className="w-full py-4 rounded-xl items-center"
                    style={[{ backgroundColor: '#F97316', shadowColor: '#F97316', shadowOpacity: 0.4, shadowRadius: 16 }, { minHeight: 44, minWidth: 44 }]}>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-lg">Send Message</Text>
                  </Pressable>"""

new_form = """                  <TextInput maxFontSizeMultiplier={1.3} placeholder="Your Name" placeholderTextColor="rgba(156,163,175,0.65)"
                    value={contactName} onChangeText={setContactName}
                    style={[{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 12, padding: 16, color: '#fff', marginBottom: 14 }, { minHeight: 44, minWidth: 44 }]} />
                  
                  <TextInput maxFontSizeMultiplier={1.3} placeholder="Email Address" placeholderTextColor="rgba(156,163,175,0.65)"
                    value={contactEmail} onChangeText={setContactEmail} keyboardType="email-address" autoCapitalize="none"
                    style={[{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 12, padding: 16, color: '#fff', marginBottom: 14 }, { minHeight: 44, minWidth: 44 }]} />
                    
                  <TextInput maxFontSizeMultiplier={1.3} placeholder="Company / Project Name" placeholderTextColor="rgba(156,163,175,0.65)"
                    value={contactProject} onChangeText={setContactProject}
                    style={[{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 12, padding: 16, color: '#fff', marginBottom: 14 }, { minHeight: 44, minWidth: 44 }]} />

                  <TextInput maxFontSizeMultiplier={1.3} placeholder="Your message" placeholderTextColor="rgba(156,163,175,0.65)"
                    multiline textAlignVertical="top" value={contactMessage} onChangeText={setContactMessage}
                    style={[{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 12, padding: 16, color: '#fff', height: 120, marginBottom: 14 }, { minHeight: 44, minWidth: 44 }]} />
                  
                  <Pressable className="w-full py-4 rounded-xl items-center" disabled={isSubmitting} onPress={handleContactSubmit}
                    style={[{ backgroundColor: isSubmitting ? '#fb923c' : '#F97316', shadowColor: '#F97316', shadowOpacity: 0.4, shadowRadius: 16 }, { minHeight: 44, minWidth: 44 }]}>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-lg">
                      {isSubmitting ? 'Sending...' : 'Send Message'}
                    </Text>
                  </Pressable>"""

content = content.replace(old_form, new_form)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("React form state configured!")
