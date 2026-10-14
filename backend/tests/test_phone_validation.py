import pytest
from pydantic import BaseModel, ValidationError, field_validator
from core.phone import normalize_sri_lankan_phone, LK_PHONE_ERROR_MESSAGE, is_valid_sri_lankan_phone


class SampleUserPayload(BaseModel):
    name: str
    contact_number: str | None = None

    @field_validator("contact_number")
    @classmethod
    def validate_contact(cls, v: str | None) -> str | None:
        return normalize_sri_lankan_phone(v)


def test_valid_mobile_numbers():
    assert normalize_sri_lankan_phone("0771234567") == "+94771234567"
    assert normalize_sri_lankan_phone("077 123 4567") == "+94771234567"
    assert normalize_sri_lankan_phone("+94 77 123 4567") == "+94771234567"
    assert normalize_sri_lankan_phone("94771234567") == "+94771234567"
    assert normalize_sri_lankan_phone("771234567") == "+94771234567"
    assert normalize_sri_lankan_phone("(077) 123-4567") == "+94771234567"


def test_mobile_prefixes():
    for prefix in ["70", "71", "72", "74", "75", "76", "77", "78"]:
        assert normalize_sri_lankan_phone(f"0{prefix}1234567") == f"+94{prefix}1234567"


def test_valid_landlines():
    assert normalize_sri_lankan_phone("011 234 5678") == "+94112345678"
    assert normalize_sri_lankan_phone("081 234 5678") == "+94812345678"
    assert normalize_sri_lankan_phone("+94 11 234 5678") == "+94112345678"


def test_invalid_letters_and_length():
    with pytest.raises(ValueError, match=LK_PHONE_ERROR_MESSAGE):
        normalize_sri_lankan_phone("077abc1234")

    with pytest.raises(ValueError, match=LK_PHONE_ERROR_MESSAGE):
        normalize_sri_lankan_phone("12345")

    with pytest.raises(ValueError, match=LK_PHONE_ERROR_MESSAGE):
        normalize_sri_lankan_phone("077123456789")

    with pytest.raises(ValueError, match=LK_PHONE_ERROR_MESSAGE):
        normalize_sri_lankan_phone("+1 415 555 2671")


def test_empty_and_optional():
    assert normalize_sri_lankan_phone(None) is None
    assert normalize_sri_lankan_phone("") is None
    assert normalize_sri_lankan_phone("   ") is None


def test_pydantic_integration():
    user = SampleUserPayload(name="Kasun", contact_number="077 123 4567")
    assert user.contact_number == "+94771234567"

    with pytest.raises(ValidationError) as exc_info:
        SampleUserPayload(name="Kasun", contact_number="invalid_phone")
    assert LK_PHONE_ERROR_MESSAGE in str(exc_info.value)
