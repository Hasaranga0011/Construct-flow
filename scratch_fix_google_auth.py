import os
import re

auth_files = [
    r'D:\PROJECTS\Construct-flow\frontend\src\app\team-register.tsx',
    r'D:\PROJECTS\Construct-flow\frontend\src\app\partner-register.tsx',
    r'D:\PROJECTS\Construct-flow\frontend\src\app\team-login.tsx',
    r'D:\PROJECTS\Construct-flow\frontend\src\app\partner-login.tsx',
    r'D:\PROJECTS\Construct-flow\frontend\src\app\admin-login.tsx'
]

google_auth_replacement = """  const handleGoogleAuth = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      
      // Save selected role to local storage so it survives the OAuth redirect
      if (typeof role !== 'undefined' && role) {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        await AsyncStorage.setItem('pending_google_role', role);
      }

      const redirectTo = Linking.createURL('auth/callback');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { 
          redirectTo, 
          skipBrowserRedirect: Platform.OS !== 'web' 
        },
      });
      
      if (error || !data?.url) throw error ?? new Error('No OAuth URL returned');

      if (Platform.OS !== 'web') {
        const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (res.type === 'success' && res.url) {
          const url = new URL(res.url);
          const hashStr = url.hash ? url.hash.replace('#', '?') : url.search;
          const params = new URLSearchParams(hashStr);
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');
          if (accessToken && refreshToken) {
            await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          } else {
             const code = params.get('code');
             if (code) {
               await supabase.auth.exchangeCodeForSession(code);
             }
          }
        } else if (res.type === 'cancel') {
          setErrorMsg('Google Sign-In was cancelled.');
        } else {
          setErrorMsg('Google Sign-In failed.');
        }
      }
    } catch (error: any) {
      setErrorMsg(error.message);
    } finally {
      setLoading(false);
    }
  };"""

for file_path in auth_files:
    if not os.path.exists(file_path):
        continue
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Inject imports if missing
    if "import * as WebBrowser" not in content:
        content = content.replace("import { supabase } from '../lib/supabase';", 
                                  "import { supabase } from '../lib/supabase';\nimport * as WebBrowser from 'expo-web-browser';\nimport * as Linking from 'expo-linking';\n\nWebBrowser.maybeCompleteAuthSession();")

    pattern = re.compile(r'const handleGoogleAuth = async \(\) => \{[\s\S]*?\n  \};', re.MULTILINE)
    if pattern.search(content):
        content = pattern.sub(google_auth_replacement, content)
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {file_path}")
    else:
        print(f"Could not find handleGoogleAuth in {file_path}")
