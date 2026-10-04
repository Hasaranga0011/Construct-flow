import os, re
d = 'src/app'
hooks = ['useRouter', 'useLocalSearchParams', 'useNavigation']
bad_files = []
for root, dirs, files in os.walk(d):
    for f in files:
        if f.endswith('.tsx') or f.endswith('.ts'):
            path = os.path.join(root, f)
            with open(path, 'r', encoding='utf-8') as file:
                content = file.read()
                missing = []
                for h in hooks:
                    if h in content:
                        # Find if h is imported from expo-router
                        # We just check if "import " and "expo-router" are present and h is somehow imported.
                        # Actually a simpler regex that handles newlines:
                        import_pattern = r'import\s*{[^}]*\b' + h + r'\b[^}]*}\s*from\s*[\'"]expo-router[\'"]'
                        if not re.search(import_pattern, content, re.MULTILINE | re.DOTALL):
                            missing.append(h)
                if missing:
                    bad_files.append((path, missing))
for p, m in bad_files:
    print(f'{p}: {m}')
