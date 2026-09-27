with open('src/app/index.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace('href="/external"', 'href="/partner-login"')

with open('src/app/index.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
