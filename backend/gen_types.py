import os, json, urllib.request

url = os.environ.get('SUPABASE_URL')
key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
if not url:
    for line in open('d:/PROJECTS/Construct-flow/backend/.env'):
        if line.startswith('SUPABASE_URL='): url = line.strip().split('=', 1)[1]
        if line.startswith('SUPABASE_SERVICE_ROLE_KEY='): key = line.strip().split('=', 1)[1]

req = urllib.request.Request(f'{url}/rest/v1/')
req.add_header('apikey', key)
req.add_header('Authorization', f'Bearer {key}')
with urllib.request.urlopen(req) as response:
    schema = json.loads(response.read())

types_file = "export type Json =\n  | string\n  | number\n  | boolean\n  | null\n  | { [key: string]: Json | undefined }\n  | Json[]\n\nexport interface Database {\n  public: {\n    Tables: {\n"

for table_name, table_schema in schema.get('definitions', {}).items():
    if not table_schema.get('properties'): continue
    types_file += f"      {table_name}: {{\n        Row: {{\n"
    for col, details in table_schema['properties'].items():
        t = details.get('type', 'any')
        ts_type = 'string' if t == 'string' else 'number' if t in ['integer', 'number'] else 'boolean' if t == 'boolean' else 'any'
        if details.get('format') == 'jsonb' or details.get('format') == 'json':
            ts_type = 'Json'
        types_file += f"          {col}: {ts_type} | null\n"
    types_file += "        }\n        Insert: { [key: string]: any }\n        Update: { [key: string]: any }\n      }\n"

types_file += "    }\n    Views: { [_ in never]: never }\n    Functions: { [_ in never]: never }\n    Enums: { [_ in never]: never }\n  }\n}\n"

with open("d:/PROJECTS/Construct-flow/frontend/src/lib/database.types.ts", "w") as f:
    f.write(types_file)

print("Generated types!")
