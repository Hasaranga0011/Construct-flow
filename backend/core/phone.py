"""
Sri Lankan phone number validation and normalization for Backend.
Strictly enforces E.164 format (+94[1-9][0-9]{8}) for database storage.
"""
import re
from typing import Optional

LK_PHONE_ERROR_MESSAGE = "Enter a valid Sri Lankan phone number, for example 077 123 4567"
LK_E164_REGEX = re.compile(r"^\+94[1-9][0-9]{8}$")


def normalize_sri_lankan_phone(value: Optional[str], required: bool = False) -> Optional[str]:
    """
    Validates and normalizes Sri Lankan phone number to E.164 (+94XXXXXXXXX).
    Accepted formats:
      - 0771234567, 077 123 4567, 077-123-4567, (077) 123 4567
      - +94 77 123 4567, +94771234567, 94771234567
      - 771234567
      - Landlines: 011 234 5678, +94 11 234 5678, 081 234 5678, etc.
    """
    if value is None:
        if required:
            raise ValueError(LK_PHONE_ERROR_MESSAGE)
        return None

    s = str(value).strip()
    if not s:
        if required:
            raise ValueError(LK_PHONE_ERROR_MESSAGE)
        return None

    # Check for invalid characters (letters, punctuation other than allowed delimiters)
    if re.search(r"[^\d\s\-\(\)\.\+]", s):
        raise ValueError(LK_PHONE_ERROR_MESSAGE)

    # Clean whitespace and formatting chars
    cleaned = re.sub(r"[\s\-\(\)\.]", "", s)

    # Normalize prefix to +94
    if cleaned.startswith("0094"):
        cleaned = "+94" + cleaned[4:]
    elif cleaned.startswith("94") and not cleaned.startswith("+94"):
        cleaned = "+94" + cleaned[2:]
    elif cleaned.startswith("0"):
        cleaned = "+94" + cleaned[1:]
    elif not cleaned.startswith("+"):
        cleaned = "+94" + cleaned

    # Must match exact LK E.164 regex: +94 followed by 9 digits (first digit is 1-9)
    if not LK_E164_REGEX.match(cleaned):
        raise ValueError(LK_PHONE_ERROR_MESSAGE)

    return cleaned


def is_valid_sri_lankan_phone(value: Optional[str]) -> bool:
    try:
        norm = normalize_sri_lankan_phone(value, required=True)
        return norm is not None
    except ValueError:
        return False
