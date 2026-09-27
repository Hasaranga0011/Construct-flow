with open('src/app/index.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace('href="/partner-login"', 'href="/external"')

with open('src/app/index.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
