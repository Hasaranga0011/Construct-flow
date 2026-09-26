export function formatMoney(n: number): string {
  if (!n || isNaN(n)) return 'Rs. 0';
  if (n >= 1e9) return `Rs. ${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `Rs. ${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `Rs. ${(n / 1e3).toFixed(1)}K`;
  return `Rs. ${n.toLocaleString()}`;
}
