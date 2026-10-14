"""
Canonical roles and mappings for ConstructFlow backend.
"""
from typing import Optional, Set

# Canonical roles
ROLE_SUPER_ADMIN = "super_admin"
ROLE_ADMIN = "admin"
ROLE_PM = "pm"
ROLE_SITE_MANAGER = "site_manager"
ROLE_WORKER = "worker"
ROLE_CLIENT = "client"
ROLE_SUPPLIER = "supplier"
ROLE_PENDING = "pending"

ALL_CANONICAL_ROLES: Set[str] = {
    ROLE_SUPER_ADMIN,
    ROLE_ADMIN,
    ROLE_PM,
    ROLE_SITE_MANAGER,
    ROLE_WORKER,
    ROLE_CLIENT,
    ROLE_SUPPLIER,
    ROLE_PENDING,
}

# Self-registration portals allowed roles
INTERNAL_PORTAL_ROLES: Set[str] = {
    ROLE_PM,
    ROLE_SITE_MANAGER,
    ROLE_WORKER,
}

PARTNER_PORTAL_ROLES: Set[str] = {
    ROLE_CLIENT,
    ROLE_SUPPLIER,
}

PUBLIC_REGISTRATION_ROLES: Set[str] = INTERNAL_PORTAL_ROLES | PARTNER_PORTAL_ROLES


def normalize_role(role: Optional[str]) -> Optional[str]:
    """
    Normalizes a role string into its canonical form.
    Maps aliases like 'project_manager' -> 'pm', 'admin' -> 'super_admin'.
    """
    if not role or not isinstance(role, str):
        return None

    cleaned = role.strip().lower().replace(" ", "_").replace("-", "_")

    alias_map = {
        "admin": ROLE_SUPER_ADMIN,
        "superadmin": ROLE_SUPER_ADMIN,
        "super_admin": ROLE_SUPER_ADMIN,
        "pm": ROLE_PM,
        "manager": ROLE_PM,
        "project_manager": ROLE_PM,
        "site_manager": ROLE_SITE_MANAGER,
        "sitemanager": ROLE_SITE_MANAGER,
        "worker": ROLE_WORKER,
        "client": ROLE_CLIENT,
        "supplier": ROLE_SUPPLIER,
        "pending": ROLE_PENDING,
    }

    return alias_map.get(cleaned, cleaned)


def is_role_match(role_a: Optional[str], role_b: Optional[str]) -> bool:
    """Checks whether two roles match taking aliases into account."""
    norm_a = normalize_role(role_a)
    norm_b = normalize_role(role_b)
    if norm_a is None or norm_b is None:
        return norm_a == norm_b
    return norm_a == norm_b
