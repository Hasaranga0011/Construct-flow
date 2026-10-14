/**
 * Amount formatting and parsing utilities for ConstructFlow.
 * Standardized to Sri Lankan locale (en-LK) with comma separator.
 */

// Separator defined in one place so changing it later is a one-line change.
export const THOUSANDS_SEPARATOR = ',';
export const DECIMAL_SEPARATOR = '.';
export const CURRENCY_PREFIX = 'Rs. ';

export interface FormatAmountOptions {
  decimals?: number;
  prefix?: string;
  compact?: boolean;
  fallback?: string;
}

/**
 * Format a number or numeric string to grouped digits (e.g. 10,000, 1,250,000).
 */
export function formatAmount(
  value: number | string | null | undefined,
  options: FormatAmountOptions = {}
): string {
  if (value === null || value === undefined || value === '') {
    return options.fallback ?? '';
  }

  const num = typeof value === 'number' ? value : parseAmount(value);
  if (num === null || isNaN(num)) {
    return options.fallback ?? '';
  }

  const prefix = options.prefix ?? '';

  if (options.compact) {
    return `${prefix}${formatCompact(num)}`;
  }

  const hasDecimals = options.decimals !== undefined;
  const decimals = options.decimals ?? (Number.isInteger(num) ? 0 : 2);

  // Group integer part with THOUSANDS_SEPARATOR
  const parts = num.toFixed(decimals).split('.');
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS_SEPARATOR);
  
  if (decimals > 0 && parts[1] !== undefined) {
    return `${prefix}${integerPart}${DECIMAL_SEPARATOR}${parts[1]}`;
  }

  return `${prefix}${integerPart}`;
}

/**
 * Convenience helper to format currency with 'Rs. ' prefix.
 */
export function formatCurrency(
  value: number | string | null | undefined,
  options: FormatAmountOptions = {}
): string {
  return formatAmount(value, {
    prefix: CURRENCY_PREFIX,
    ...options,
  });
}

/**
 * Format compact representations (e.g., 1.25M, 500K) for summary cards and helpers.
 */
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (abs >= 1_000_000_000) {
    const v = (abs / 1_000_000_000).toFixed(2).replace(/\.00$/, '').replace(/(\.[1-9])0$/, '$1');
    return `${sign}${v}B`;
  }
  if (abs >= 1_000_000) {
    const v = (abs / 1_000_000).toFixed(2).replace(/\.00$/, '').replace(/(\.[1-9])0$/, '$1');
    return `${sign}${v}M`;
  }
  if (abs >= 1_000) {
    const v = (abs / 1_000).toFixed(1).replace(/\.0$/, '');
    return `${sign}${v}K`;
  }

  return `${sign}${abs}`;
}

/**
 * Format compact currency e.g. 'Rs. 1.25M'
 */
export function formatCompactCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return '';
  return `Rs. ${formatCompact(value)}`;
}

/**
 * Derive a compact version of an already formatted display string by shortening
 * every grouped number >= 1,000 while keeping prefixes/suffixes intact.
 *   'Rs. 12,266,652,281.71' -> 'Rs. 12.27B'
 *   'LKR 2,500,000 / sqft'  -> 'LKR 2.5M / sqft'
 * Returns null when nothing could be shortened (e.g. '42', '3 / 5', 'Not recorded').
 */
export function compactDisplayValue(display: string | number | null | undefined): string | null {
  if (display === null || display === undefined) return null;
  const source = String(display);
  let changed = false;
  const result = source.replace(/-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d{4,}(?:\.\d+)?/g, token => {
    const num = parseFloat(token.replace(/,/g, ''));
    if (isNaN(num) || Math.abs(num) < 1000) return token;
    changed = true;
    return formatCompact(num);
  });
  return changed ? result : null;
}

/**
 * Parse an amount input string into a raw numeric value.
 * Strips commas, spaces, currency symbols, and extra decimals.
 * Returns null if input is empty or invalid (empty is empty, not 0).
 */
export function parseAmount(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    return isNaN(input) ? null : input;
  }

  const str = String(input).trim();
  if (str === '') return null;

  // Remove currency signs (Rs, Rs., LKR), spaces, and thousands separators, but preserve decimal dot
  let cleaned = str
    .replace(/(Rs\.?|LKR)/gi, '')
    .replace(/[,\s]/g, '');

  if (cleaned === '' || cleaned === '-') return null;

  // Only allow first decimal point
  const dotIndex = cleaned.indexOf('.');
  if (dotIndex !== -1) {
    const intPart = cleaned.slice(0, dotIndex).replace(/[^\d-]/g, '');
    const decPart = cleaned.slice(dotIndex + 1).replace(/[^\d]/g, '');
    cleaned = intPart + '.' + decPart;
  } else {
    cleaned = cleaned.replace(/[^\d-]/g, '');
  }

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Live formatting for input fields as the user types:
 * - Keeps digits and decimal point.
 * - Formats integer part with commas.
 * - Allows typing a trailing dot (e.g. "1,000.").
 * - Limits decimal places to maxDecimals (default 2).
 */
export function formatAmountLive(
  rawInput: string,
  options: { allowDecimals?: boolean; maxDecimals?: number } = {}
): { formatted: string; rawNumber: number | null } {
  const allowDecimals = options.allowDecimals ?? true;
  const maxDecimals = options.maxDecimals ?? 2;

  if (!rawInput || rawInput.trim() === '') {
    return { formatted: '', rawNumber: null };
  }

  // Remove invalid characters (keep digits, one dot, leading minus)
  let val = rawInput.replace(/[^0-9.-]/g, '');
  
  // Handle leading minus
  const isNegative = val.startsWith('-');
  val = val.replace(/-/g, '');

  // Split integer and decimal
  const dotIndex = val.indexOf('.');
  let integerPart = dotIndex !== -1 ? val.substring(0, dotIndex) : val;
  let decimalPart = dotIndex !== -1 && allowDecimals ? val.substring(dotIndex + 1) : null;

  // Strip leading zeros unless followed by decimal or is just "0"
  if (integerPart.length > 1 && integerPart.startsWith('0')) {
    integerPart = integerPart.replace(/^0+/, '') || '0';
  }

  // Format integer part with thousands separator
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS_SEPARATOR);

  let formatted = (isNegative ? '-' : '') + (formattedInteger || (dotIndex !== -1 ? '0' : ''));

  if (allowDecimals && dotIndex !== -1) {
    const limitedDecimals = (decimalPart ?? '').slice(0, maxDecimals);
    formatted += DECIMAL_SEPARATOR + limitedDecimals;
  }

  const rawNumber = parseAmount(formatted);
  return { formatted, rawNumber };
}
