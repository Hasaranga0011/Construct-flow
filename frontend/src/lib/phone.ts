/**
 * Sri Lankan phone number parsing, validation and formatting using libphonenumber-js.
 */
import { parsePhoneNumberFromString, AsYouType } from 'libphonenumber-js';

export const LK_PHONE_ERROR_MESSAGE = 'Enter a valid Sri Lankan phone number, for example 077 123 4567';

// Strict regex matching E.164 Sri Lankan numbers: +94 followed by 9 digits (1-9 then 8 digits)
export const LK_E164_REGEX = /^\+94[1-9][0-9]{8}$/;

/**
 * Clean any formatting characters (spaces, dashes, parentheses, dots).
 */
export function cleanPhoneInput(input: string): string {
  if (!input) return '';
  return input.replace(/[\s\-\(\)\.]/g, '').trim();
}

/**
 * Checks if a string contains non-numeric / non-plus characters.
 */
export function hasInvalidCharacters(input: string): boolean {
  return /[^\d\s\-\(\)\.\+]/.test(input);
}

/**
 * Normalizes any valid Sri Lankan phone format into E.164 (+94771234567).
 * Accepted inputs:
 *  - 0771234567
 *  - 077 123 4567
 *  - +94 77 123 4567
 *  - 94771234567
 *  - 771234567
 * Returns null if invalid.
 */
export function normalizeToE164(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') return null;

  const trimmed = input.trim();
  if (trimmed === '') return null;

  if (hasInvalidCharacters(trimmed)) return null;

  let cleaned = cleanPhoneInput(trimmed);

  // Normalize leading forms
  if (cleaned.startsWith('0094')) {
    cleaned = '+94' + cleaned.slice(4);
  } else if (cleaned.startsWith('94') && !cleaned.startsWith('+94')) {
    cleaned = '+94' + cleaned.slice(2);
  } else if (cleaned.startsWith('0')) {
    cleaned = '+94' + cleaned.slice(1);
  } else if (!cleaned.startsWith('+')) {
    // e.g. 771234567
    cleaned = '+94' + cleaned;
  }

  // Check strict regex
  if (!LK_E164_REGEX.test(cleaned)) {
    return null;
  }

  // Double check with libphonenumber-js
  try {
    const parsed = parsePhoneNumberFromString(cleaned, 'LK');
    if (parsed && parsed.isValid() && parsed.country === 'LK') {
      return parsed.number as string; // E.164: +94XXXXXXXXX
    }
  } catch (e) {
    // Fall back to regex if libphonenumber fails on newly assigned operator prefixes
  }

  // If regex matched strict LK format:
  return cleaned;
}

/**
 * Checks whether an input is a valid Sri Lankan phone number.
 */
export function isValidSriLankanPhone(input: string | null | undefined): boolean {
  if (!input || typeof input !== 'string') return false;
  return normalizeToE164(input) !== null;
}

/**
 * Formats a phone number for local Sri Lankan display: 0XX XXX XXXX (e.g. 077 123 4567 or 011 234 5678).
 */
export function formatSriLankanPhoneLocal(input: string | null | undefined): string {
  if (!input) return '';
  const e164 = normalizeToE164(input);
  if (!e164) {
    return input; // return as-is if unparseable
  }

  // e164 is +94XXXXXXXXX (12 chars: +94 then 9 digits)
  const digits = e164.slice(3); // 9 digits
  const part1 = '0' + digits.slice(0, 2); // 077 or 011
  const part2 = digits.slice(2, 5);       // 123
  const part3 = digits.slice(5);          // 4567

  return `${part1} ${part2} ${part3}`;
}

/**
 * Live formatting for phone input fields as the user types (0XX XXX XXXX).
 */
export function formatPhoneAsYouType(rawInput: string): string {
  if (!rawInput) return '';

  // If letters are present, keep as-is so validation can flag it
  if (/[a-zA-Z]/.test(rawInput)) {
    return rawInput;
  }

  // Extract digits and optional plus
  let cleaned = rawInput.replace(/[^\d+]/g, '');

  // Handle +94 prefix gracefully
  let isIntl = false;
  if (cleaned.startsWith('+94')) {
    cleaned = '0' + cleaned.slice(3);
    isIntl = true;
  } else if (cleaned.startsWith('94') && cleaned.length > 9) {
    cleaned = '0' + cleaned.slice(2);
  }

  // Strip leading plus if present elsewhere
  cleaned = cleaned.replace(/\+/g, '');

  // If user started without 0 and typed digits (e.g. 77123...)
  if (cleaned.length > 0 && !cleaned.startsWith('0') && !isIntl) {
    cleaned = '0' + cleaned;
  }

  // Truncate to maximum 10 local digits
  const digits = cleaned.slice(0, 10);

  if (digits.length <= 3) {
    return digits;
  }
  if (digits.length <= 6) {
    return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  }
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

/**
 * Get call link for mobile/landline.
 */
export function toTelLink(phone: string | null | undefined): string | null {
  const e164 = normalizeToE164(phone);
  return e164 ? `tel:${e164}` : null;
}

/**
 * Get WhatsApp chat link for mobile.
 */
export function toWhatsAppLink(phone: string | null | undefined): string | null {
  const e164 = normalizeToE164(phone);
  if (!e164) return null;
  // WhatsApp format: digits without +
  const waNumber = e164.replace('+', '');
  return `https://wa.me/${waNumber}`;
}
