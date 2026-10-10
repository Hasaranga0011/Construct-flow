import os

path = r'D:\PROJECTS\Construct-flow\frontend\src\app\index.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old_handle_func = """  const handleContactSubmit = async () => {
    if (!contactName || !contactEmail || !contactMessage) {
      if (Platform.OS === 'web') { alert('Please fill in your name, email, and message.'); }
      else { Alert.alert('Missing Fields', 'Please fill in your name, email, and message.'); }
      return;
    }
    setIsSubmitting(true);
    try {
      // Send directly to the Admin's notification dashboard and database
      const fullMessage = `Name: ${contactName}\\nEmail: ${contactEmail}\\nProject: ${contactProject || 'N/A'}\\n\\nMessage: ${contactMessage}`;
      const { error } = await supabase.from('notifications').insert([
        { 
          type: 'Info',
          title: `New Inquiry: ${contactName}`,
          message: fullMessage,
          target_role: 'admin',
          is_read: false,
          sent_via: 'web'
        }
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
  };"""

new_handle_func = """  const handleContactSubmit = async () => {
    if (!contactName || !contactEmail || !contactMessage) {
      if (Platform.OS === 'web') { alert('Please fill in your name, email, and message.'); }
      else { Alert.alert('Missing Fields', 'Please fill in your name, email, and message.'); }
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/public-inquiry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: contactName,
          email: contactEmail,
          project_name: contactProject,
          message: contactMessage
        })
      });
      
      if (!response.ok) throw new Error('Network response was not ok');
      
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
  };"""

if old_handle_func in content:
    content = content.replace(old_handle_func, new_handle_func)
    print("Replaced successfully!")
else:
    print("Function not found!")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
