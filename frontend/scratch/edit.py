import sys

with open('src/app/external.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('export default function HomeScreen', 'export default function ExternalHomeScreen')
content = content.replace("router.push('/login')", "router.push('/partner-login')")
content = content.replace("router.push('/partner-login')", "router.push('/partner-login' as any)")
content = content.replace("Get Started", "Sign In")
content = content.replace("Sign In", "Sign In / Register")

# Replace second button with register if it exists next to login
content = content.replace(
    "router.push('/partner-login' as any)",
    "router.push('/partner-login')"
) # Undo the as any for a moment

with open('src/app/external.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
