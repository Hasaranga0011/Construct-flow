#!/usr/bin/env python3
"""
Repair User Roles Script
Detects and repairs discrepancies between Supabase Auth metadata and the public.profiles table.
Supports --dry-run (default) and --apply.
"""
import argparse
import sys
import os

# Add parent directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from supabase import create_client
from core.config import settings
from core.roles import normalize_role, is_role_match


def main():
    parser = argparse.ArgumentParser(description="Audit and repair user roles between Auth and Profiles")
    parser.add_argument("--apply", action="store_true", help="Apply fixes to database (default is dry-run)")
    args = parser.parse_args()

    dry_run = not args.apply

    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        print("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment.")
        sys.exit(1)

    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

    print(f"--- Running User Role Audit ({'DRY RUN - No changes will be made' if dry_run else 'APPLYING FIXES'}) ---")

    auth_users = client.auth.admin.list_users()
    profiles_res = client.table("profiles").select("id, email, full_name, role").execute()
    profiles_by_id = {p["id"]: p for p in (profiles_res.data or [])}

    mismatches = []

    for u in auth_users:
        uid = str(u.id)
        profile = profiles_by_id.get(uid)

        app_meta = getattr(u, "app_metadata", {}) or {}
        user_meta = getattr(u, "user_metadata", {}) or {}
        auth_role = app_meta.get("role") or user_meta.get("role")
        canonical_auth_role = normalize_role(auth_role)
        profile_role = profile.get("role") if profile else None
        canonical_profile_role = normalize_role(profile_role)

        if profile and canonical_auth_role and not is_role_match(canonical_auth_role, canonical_profile_role):
            mismatches.append({
                "id": uid,
                "email": u.email,
                "full_name": profile.get("full_name"),
                "auth_role": canonical_auth_role,
                "profile_role": profile_role,
            })

    if not mismatches:
        print(f"Success: All {len(auth_users)} users have matching roles in Auth and Profiles.")
        return

    print(f"\nFound {len(mismatches)} user(s) with mismatched roles:")
    for m in mismatches:
        print(f"  User {m['id']} ({m['email']}): Auth metadata says '{m['auth_role']}', but profile has '{m['profile_role']}'")

    if dry_run:
        print("\nTo apply these fixes and align profile roles with Auth metadata, run:")
        print("  python backend/scripts/repair_user_roles.py --apply")
    else:
        print("\nApplying fixes...")
        fixed_count = 0
        for m in mismatches:
            target_role = m["auth_role"]
            res = client.table("profiles").update({"role": target_role}).eq("id", m["id"]).execute()
            if res.data:
                fixed_count += 1
                print(f"  Updated user {m['id']} profile role to '{target_role}'")
            else:
                print(f"  Warning: Failed to update user {m['id']}")
        print(f"\nCompleted! Fixed {fixed_count} user profile(s).")


if __name__ == "__main__":
    main()
