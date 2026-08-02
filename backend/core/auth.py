from fastapi import Request, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from core.supabase_client import supabase_db

security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)):
    token = credentials.credentials
    try:
        # Validate JWT token by fetching user details from Supabase
        user_response = supabase_db.auth.get_user(token)
        
        if not user_response or not user_response.user:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
            
        user = user_response.user
        
        # Fetch role from profiles table
        profile_res = supabase_db.table('profiles').select('role').eq('id', user.id).execute()
        
        role = 'client' # Default fallback
        if profile_res.data and len(profile_res.data) > 0:
            role = profile_res.data[0].get('role', 'client')
            
        return {
            "id": user.id,
            "email": user.email,
            "role": role
        }
    except Exception as e:
        print(f"Auth error: {e}")
        raise HTTPException(status_code=401, detail="Could not validate credentials")
