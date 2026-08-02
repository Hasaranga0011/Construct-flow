from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from .database import supabase
from typing import Optional

security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)):
    token = credentials.credentials
    try:
        # Validate the token directly with Supabase
        user_response = supabase.auth.get_user(token)
        if not user_response.user:
             raise HTTPException(status_code=401, detail="Invalid authentication credentials")
             
        try:
            # Fetch the user's role from the profiles table
            profile_response = supabase.table("profiles").select("role").eq("id", user_response.user.id).single().execute()
            role = profile_response.data.get("role") if profile_response.data else "Manager"
        except Exception as profile_err:
            print(f"Could not fetch profile, defaulting to Manager: {profile_err}")
            role = "Manager"
        
        return {
            "id": user_response.user.id,
            "email": user_response.user.email,
            "role": role,
            "token": token
        }
    except Exception as e:
        print("Auth Error:", e)
        raise HTTPException(status_code=401, detail="Could not validate credentials")

def require_admin(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "Admin":
        raise HTTPException(status_code=403, detail="Not enough privileges")
    return current_user
    
def require_manager_or_admin(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["Admin", "Manager"]:
        raise HTTPException(status_code=403, detail="Not enough privileges")
    return current_user
