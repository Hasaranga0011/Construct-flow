import pytest
from core.email_validator import validate_gmail_for_registration, is_valid_gmail

def test_valid_gmail_addresses():
    valid_emails = [
        "janindi.perera@gmail.com",
        "dimuthushalinda0404@gmail.com",
        "kasun123@gmail.com",
        "john.doe.smith@gmail.com",
        "a1b2c3d4@gmail.com",
        "valid.user99@GMAIL.COM",  # case-insensitive
    ]
    for email in valid_emails:
        norm = validate_gmail_for_registration(email)
        assert norm.endswith("@gmail.com")
        assert is_valid_gmail(email) is True

def test_reject_typo_domains():
    typos = [
        "user@gnail.com",
        "user@gamil.com",
        "user@gmial.com",
        "user@gmaill.com",
        "user@gmai.com",
        "user@gmail.co",
        "user@gmail.con",
    ]
    for email in typos:
        with pytest.raises(ValueError) as excinfo:
            validate_gmail_for_registration(email)
        assert "Did you mean @gmail.com?" in str(excinfo.value)
        assert is_valid_gmail(email) is False

def test_reject_non_gmail_domains():
    non_gmail = [
        "user@yahoo.com",
        "user@outlook.com",
        "user@hotmail.com",
        "user@constructflow.lk",
        "user@company.org",
    ]
    for email in non_gmail:
        with pytest.raises(ValueError) as excinfo:
            validate_gmail_for_registration(email)
        assert "Only valid Gmail accounts (@gmail.com) are permitted" in str(excinfo.value)
        assert is_valid_gmail(email) is False

def test_reject_short_username():
    short_emails = [
        "a@gmail.com",
        "ab@gmail.com",
        "abc@gmail.com",
        "abcd@gmail.com",
        "abcde@gmail.com",  # 5 characters, Gmail requires 6
    ]
    for email in short_emails:
        with pytest.raises(ValueError) as excinfo:
            validate_gmail_for_registration(email)
        assert "at least 6 characters" in str(excinfo.value)

def test_reject_long_username():
    long_email = "a" * 31 + "@gmail.com"  # 31 characters
    with pytest.raises(ValueError) as excinfo:
        validate_gmail_for_registration(long_email)
    assert "cannot exceed 30 characters" in str(excinfo.value)

def test_reject_invalid_characters_and_dots():
    invalid_cases = [
        ("user..name@gmail.com", "consecutive periods"),
        (".username@gmail.com", "start or end with a period"),
        ("username.@gmail.com", "start or end with a period"),
        ("user!name@gmail.com", "letters (a-z), numbers (0-9), and periods"),
        ("user+tag@gmail.com", "letters (a-z), numbers (0-9), and periods"),
    ]
    for email, err_substr in invalid_cases:
        with pytest.raises(ValueError) as excinfo:
            validate_gmail_for_registration(email)
        assert err_substr in str(excinfo.value)
