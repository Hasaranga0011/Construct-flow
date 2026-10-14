import {
  isValidSriLankanPhone,
  normalizeToE164,
  formatSriLankanPhoneLocal,
  formatPhoneAsYouType,
  toTelLink,
  toWhatsAppLink,
  LK_PHONE_ERROR_MESSAGE,
} from '../phone';

describe('Sri Lankan phone number utilities', () => {
  describe('normalizeToE164 and isValidSriLankanPhone', () => {
    it('accepts standard mobile in various input formats', () => {
      const expected = '+94771234567';
      expect(normalizeToE164('0771234567')).toBe(expected);
      expect(normalizeToE164('077 123 4567')).toBe(expected);
      expect(normalizeToE164('+94 77 123 4567')).toBe(expected);
      expect(normalizeToE164('94771234567')).toBe(expected);
      expect(normalizeToE164('771234567')).toBe(expected);
      expect(normalizeToE164('077-123-4567')).toBe(expected);
      expect(normalizeToE164('(077) 123 4567')).toBe(expected);

      expect(isValidSriLankanPhone('0771234567')).toBe(true);
      expect(isValidSriLankanPhone('077 123 4567')).toBe(true);
      expect(isValidSriLankanPhone('+94 77 123 4567')).toBe(true);
    });

    it('accepts other mobile operator prefixes (70 to 78)', () => {
      expect(normalizeToE164('070 123 4567')).toBe('+94701234567');
      expect(normalizeToE164('071 123 4567')).toBe('+94711234567');
      expect(normalizeToE164('072 123 4567')).toBe('+94721234567');
      expect(normalizeToE164('074 123 4567')).toBe('+94741234567');
      expect(normalizeToE164('075 123 4567')).toBe('+94751234567');
      expect(normalizeToE164('076 123 4567')).toBe('+94761234567');
      expect(normalizeToE164('077 123 4567')).toBe('+94771234567');
      expect(normalizeToE164('078 123 4567')).toBe('+94781234567');
    });

    it('accepts landline numbers (e.g. Colombo 011, Kandy 081)', () => {
      expect(normalizeToE164('011 234 5678')).toBe('+94112345678');
      expect(normalizeToE164('081 234 5678')).toBe('+94812345678');
      expect(normalizeToE164('+94 11 234 5678')).toBe('+94112345678');
      expect(isValidSriLankanPhone('011 234 5678')).toBe(true);
    });

    it('rejects letters and special symbols', () => {
      expect(isValidSriLankanPhone('abc')).toBe(false);
      expect(isValidSriLankanPhone('077abc1234')).toBe(false);
      expect(isValidSriLankanPhone('077 123 456a')).toBe(false);
      expect(normalizeToE164('077abc1234')).toBeNull();
    });

    it('rejects numbers with wrong length', () => {
      expect(isValidSriLankanPhone('12345')).toBe(false);
      expect(isValidSriLankanPhone('077123')).toBe(false);
      expect(isValidSriLankanPhone('077123456789')).toBe(false);
      expect(normalizeToE164('12345')).toBeNull();
    });

    it('rejects foreign numbers (non-Sri Lanka)', () => {
      expect(isValidSriLankanPhone('+1 415 555 2671')).toBe(false);
      expect(isValidSriLankanPhone('+44 20 7946 0919')).toBe(false);
      expect(normalizeToE164('+1 415 555 2671')).toBeNull();
    });

    it('handles null, undefined and empty', () => {
      expect(isValidSriLankanPhone('')).toBe(false);
      expect(isValidSriLankanPhone(null)).toBe(false);
      expect(isValidSriLankanPhone(undefined)).toBe(false);
      expect(normalizeToE164('')).toBeNull();
      expect(normalizeToE164(null)).toBeNull();
    });
  });

  describe('formatSriLankanPhoneLocal', () => {
    it('formats mobile and landline numbers for local display', () => {
      expect(formatSriLankanPhoneLocal('+94771234567')).toBe('077 123 4567');
      expect(formatSriLankanPhoneLocal('0771234567')).toBe('077 123 4567');
      expect(formatSriLankanPhoneLocal('+94112345678')).toBe('011 234 5678');
      expect(formatSriLankanPhoneLocal('0112345678')).toBe('011 234 5678');
    });
  });

  describe('formatPhoneAsYouType', () => {
    it('formats input progressively as digits are entered', () => {
      expect(formatPhoneAsYouType('077')).toBe('077');
      expect(formatPhoneAsYouType('0771')).toBe('077 1');
      expect(formatPhoneAsYouType('077123')).toBe('077 123');
      expect(formatPhoneAsYouType('0771234')).toBe('077 123 4');
      expect(formatPhoneAsYouType('0771234567')).toBe('077 123 4567');
    });

    it('converts +94 to local leading 0 smoothly while typing', () => {
      expect(formatPhoneAsYouType('+94771234567')).toBe('077 123 4567');
    });
  });

  describe('links', () => {
    it('creates tel link with E.164', () => {
      expect(toTelLink('077 123 4567')).toBe('tel:+94771234567');
      expect(toTelLink('invalid')).toBeNull();
    });

    it('creates whatsapp link with E.164 digits', () => {
      expect(toWhatsAppLink('077 123 4567')).toBe('https://wa.me/94771234567');
      expect(toWhatsAppLink('invalid')).toBeNull();
    });
  });
});
