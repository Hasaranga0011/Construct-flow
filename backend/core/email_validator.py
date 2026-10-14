"""
Gmail account validation and normalization for ConstructFlow registration.
Strictly enforces Google Gmail username rules and domain validity (@gmail.com).
"""
import re
from typing import Optional

GMAIL_DOMAIN = "gmail.com"

# Common typos for gmail.com to catch user mistakes (e.g. gnail.com)
GMAIL_TYPO_DOMAINS = {
    "gnail.com",
    "gamil.com",
    "gmial.com",
    "gmaill.com",
    "gmal.com",
    "gmai.com",
    "gmaik.com",
    "gmeil.com",
    "gmail.co",
    "gmail.con",
    "gmail.cpm",
    "gmail.cm",
    "gemail.com",
    "gmail.com.com",
    "gmaild.com",
}

# Google Gmail username rules:
# - Between 6 and 30 characters long
# - Letters (a-z), numbers (0-9), and periods (.)
# - Cannot start or end with a period
# - Cannot contain consecutive periods (..)
GMAIL_USERNAME_REGEX = re.compile(r"^[a-zA-Z0-9](?!.*\.\.)[a-zA-Z0-9.]{4,28}[a-zA-Z0-9]$")


def validate_gmail_for_registration(value: Optional[str]) -> str:
    """
    Validates and normalizes an email address strictly for Gmail accounts.
    Returns the normalized email address (e.g., 'username@gmail.com').
    Raises ValueError with descriptive guidance if invalid.
    """
    if not value or not str(value).strip():
        raise ValueError("Email address is required.")

    cleaned = str(value).strip().lower()

    if "@" not in cleaned:
        raise ValueError("Invalid email format. Please provide a valid @gmail.com address.")

    parts = cleaned.split("@", 1)
    username = parts[0].strip()
    domain = parts[1].strip()

    # Check for common typo domains
    if domain in GMAIL_TYPO_DOMAINS:
        raise ValueError(
            f"Did you mean @gmail.com? You entered '@{domain}'. Only valid Gmail accounts (@gmail.com) can be registered."
        )

    # Enforce @gmail.com domain
    if domain != GMAIL_DOMAIN:
        raise ValueError(
            "Only valid Gmail accounts (@gmail.com) are permitted for registration. Please use a @gmail.com address."
        )

    # Check username length
    if len(username) < 6:
        raise ValueError("Invalid Gmail address. Gmail usernames must be at least 6 characters long.")
    if len(username) > 30:
        raise ValueError("Invalid Gmail address. Gmail usernames cannot exceed 30 characters.")

    # Check for disallowed characters
    if not re.match(r"^[a-zA-Z0-9.]+$", username):
        raise ValueError(
            "Invalid Gmail address. Gmail usernames can only contain letters (a-z), numbers (0-9), and periods (.)."
        )

    # Check start/end period and consecutive periods
    if username.startswith(".") or username.endswith("."):
        raise ValueError("Invalid Gmail address. Gmail usernames cannot start or end with a period.")
    if ".." in username:
        raise ValueError("Invalid Gmail address. Gmail usernames cannot contain consecutive periods.")

    # Match overall regex
    if not GMAIL_USERNAME_REGEX.match(username):
        raise ValueError(
            "Invalid Gmail address format. Please enter a valid Gmail account (e.g. yourname@gmail.com)."
        )

    return f"{username}@{GMAIL_DOMAIN}"


def is_valid_gmail(value: Optional[str]) -> bool:
    """Helper to check if an email is a valid Gmail address without raising an exception."""
    try:
        validate_gmail_for_registration(value)
        return True
    except ValueError:
        return False
