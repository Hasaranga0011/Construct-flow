import { formatAmount, formatCurrency, parseAmount, formatAmountLive, formatCompact, formatCompactCurrency, compactDisplayValue } from '../amount';

describe('amount utilities', () => {
  describe('parseAmount', () => {
    it('handles empty, null and undefined', () => {
      expect(parseAmount('')).toBeNull();
      expect(parseAmount(null)).toBeNull();
      expect(parseAmount(undefined)).toBeNull();
      expect(parseAmount('   ')).toBeNull();
    });

    it('parses standard numbers and formatted strings', () => {
      expect(parseAmount(10000)).toBe(10000);
      expect(parseAmount('10,000')).toBe(10000);
      expect(parseAmount('100,000')).toBe(100000);
      expect(parseAmount('1,250,000')).toBe(1250000);
    });

    it('parses strings with currency prefixes and spaces', () => {
      expect(parseAmount('Rs. 1,250,000')).toBe(1250000);
      expect(parseAmount('Rs. 500.50')).toBe(500.5);
      expect(parseAmount('LKR 2,500,000.75')).toBe(2500000.75);
      expect(parseAmount(' 10 000 ')).toBe(10000);
    });

    it('handles pasted alternate comma formats and leading zeros', () => {
      expect(parseAmount('1,00,000')).toBe(100000);
      expect(parseAmount('00500')).toBe(500);
      expect(parseAmount('0.75')).toBe(0.75);
    });

    it('handles multiple decimal points by ignoring secondary decimals', () => {
      expect(parseAmount('100.50.25')).toBe(100.5025);
    });
  });

  describe('formatAmount', () => {
    it('formats numbers with commas', () => {
      expect(formatAmount(10000)).toBe('10,000');
      expect(formatAmount(100000)).toBe('100,000');
      expect(formatAmount(1250000)).toBe('1,250,000');
      expect(formatAmount(1250000.5, { decimals: 2 })).toBe('1,250,000.50');
    });

    it('formats with prefix', () => {
      expect(formatAmount(10000, { prefix: 'Rs. ' })).toBe('Rs. 10,000');
      expect(formatCurrency(1250000)).toBe('Rs. 1,250,000');
    });

    it('handles compact format', () => {
      expect(formatAmount(1250000, { compact: true })).toBe('1.25M');
      expect(formatCompactCurrency(1250000)).toBe('Rs. 1.25M');
      expect(formatCompactCurrency(50000)).toBe('Rs. 50K');
    });

    it('handles null, undefined and empty', () => {
      expect(formatAmount(null)).toBe('');
      expect(formatAmount(undefined, { fallback: 'N/A' })).toBe('N/A');
    });
  });

  describe('compactDisplayValue', () => {
    it('shortens grouped currency values and keeps prefixes/suffixes', () => {
      expect(compactDisplayValue('Rs. 12,266,652,281.71')).toBe('Rs. 12.27B');
      expect(compactDisplayValue('Rs. 844,451,269')).toBe('Rs. 844.45M');
      expect(compactDisplayValue('LKR 2,500,000 / sqft')).toBe('LKR 2.5M / sqft');
      expect(compactDisplayValue('LKR 1250000')).toBe('LKR 1.25M');
      expect(compactDisplayValue('-Rs. 1,500')).toBe('-Rs. 1.5K');
    });

    it('returns null when nothing can be shortened', () => {
      expect(compactDisplayValue('42')).toBeNull();
      expect(compactDisplayValue('3 / 5')).toBeNull();
      expect(compactDisplayValue('Not recorded')).toBeNull();
      expect(compactDisplayValue(null)).toBeNull();
    });
  });

  describe('formatAmountLive', () => {
    it('formats as user types without breaking typing flow', () => {
      expect(formatAmountLive('1000').formatted).toBe('1,000');
      expect(formatAmountLive('10000').formatted).toBe('10,000');
      expect(formatAmountLive('100000').formatted).toBe('100,000');
      expect(formatAmountLive('1250000').formatted).toBe('1,250,000');
    });

    it('preserves trailing dot for typing decimals', () => {
      const res = formatAmountLive('1000.');
      expect(res.formatted).toBe('1,000.');
      expect(res.rawNumber).toBe(1000);
    });

    it('limits decimals to maxDecimals', () => {
      const res = formatAmountLive('1000.555', { maxDecimals: 2 });
      expect(res.formatted).toBe('1,000.55');
      expect(res.rawNumber).toBe(1000.55);
    });

    it('strips leading zeros', () => {
      expect(formatAmountLive('0500').formatted).toBe('500');
      expect(formatAmountLive('0').formatted).toBe('0');
      expect(formatAmountLive('0.5').formatted).toBe('0.5');
    });
  });
});
