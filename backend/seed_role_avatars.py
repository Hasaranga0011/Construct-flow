import os
import requests
from dotenv import load_dotenv

load_dotenv('d:/PROJECTS/Construct-flow/backend/.env')
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

ROLE_AVATARS = {
    "admin": [
        "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&auto=format&fit=crop&q=80",
    ],
    "pm": [
        "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=400&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&auto=format&fit=crop&q=80",
    ],
    "site_manager": [
        "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1541888946425-d0fbb1861593?w=400&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=400&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=400&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=400&auto=format&fit=crop&q=80",
    ],
    "worker": [
        "https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?w=400&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=400&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1578328819058-b69f3a3b0f6b?w=400&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=400&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1590402494682-cd3fb53b1f70?w=400&auto=format&fit=crop&q=80",
    ],
    "client": [
        "https://images.unsplash.com/photo-1556157382-97eda2d62296?w=400&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=400&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400&auto=format&fit=crop&q=80",
    ],
    "supplier": [
        "https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=400&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1581092335397-9583fe92d232?w=400&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=400&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80",
    ]
}

res = requests.get(f"{url}/rest/v1/profiles?select=id,full_name,role,avatar_url", headers=headers)
profiles = res.json()
print(f"Loaded {len(profiles)} profiles.")

updated_count = 0
for idx, p in enumerate(profiles):
    role_key = (p.get("role") or "worker").lower().replace(" ", "_")
    if "admin" in role_key:
        avatar_list = ROLE_AVATARS["admin"]
    elif "pm" in role_key or "project" in role_key:
        avatar_list = ROLE_AVATARS["pm"]
    elif "site" in role_key:
        avatar_list = ROLE_AVATARS["site_manager"]
    elif "suppl" in role_key:
        avatar_list = ROLE_AVATARS["supplier"]
    elif "client" in role_key:
        avatar_list = ROLE_AVATARS["client"]
    else:
        avatar_list = ROLE_AVATARS["worker"]
    
    # Pick deterministic avatar based on ID / index
    selected_avatar = avatar_list[idx % len(avatar_list)]
    
    # Update avatar
    upd_res = requests.patch(
        f"{url}/rest/v1/profiles?id=eq.{p['id']}",
        headers=headers,
        json={"avatar_url": selected_avatar}
    )
    if upd_res.status_code == 200:
        updated_count += 1
    else:
        print(f"Failed to update profile {p['id']}: {upd_res.status_code}")

print(f"Successfully updated {updated_count} / {len(profiles)} profiles with role avatars!")
