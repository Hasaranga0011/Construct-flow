export type ReportRow = { id: string; [key: string]: unknown };
export type ManagementReport = {
  projects: ReportRow[]; materials: ReportRow[]; orders: ReportRow[]; payroll: ReportRow[];
  people: { id: string; full_name: string | null }[]; generated_at: string;
};
export const numeric = (value: unknown): number | null => {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '') || typeof value === 'boolean') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
};
export const text = (value: unknown, fallback = 'Not recorded') => value === null || value === undefined || value === '' ? fallback : String(value);
export const status = (value: unknown) => text(value, 'unknown').toLowerCase().replace(/[_-]/g, ' ').trim();
export const money = (value: number | null) => value === null ? 'Not recorded' : `Rs. ${value.toLocaleString('en-LK', { maximumFractionDigits: 2 })}`;
export const localDay = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function dateKey(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const key = value.slice(0, 10);
  const parsed = new Date(`${key}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === key ? key : null;
}
export const monthKey = (value: unknown) => dateKey(value)?.slice(0, 7) ?? null;
export const amount = (row: ReportRow) => numeric(row.total_amount ?? row.total_payout);
export const overtime = (row: ReportRow) => numeric(row.total_overtime_hours ?? row.overtime_hours);
export const siteId = (row: ReportRow) => text(row.site_id ?? row.project_id, '');
export const sumKnown = (rows: ReportRow[], get: (row: ReportRow) => number | null): number | null => {
  const values = rows.map(get).filter((n): n is number => n !== null);
  return !rows.length ? 0 : values.length ? values.reduce((a, b) => a + b, 0) : null;
};
export const closedProject = (row: ReportRow) => ['completed', 'complete', 'cancelled', 'canceled', 'closed'].includes(status(row.status));
export const overBudget = (row: ReportRow) => {
  const budget = numeric(row.total_budget), spent = numeric(row.spent_cost);
  return budget !== null && spent !== null && spent > budget;
};
export const overdueProject = (row: ReportRow, today = localDay()) => !closedProject(row) && !!dateKey(row.end_date) && dateKey(row.end_date)! < today;
export const projectFlags = (row: ReportRow, today = localDay()) => {
  const flags = [];
  if (overBudget(row)) flags.push('Over budget');
  if (overdueProject(row, today)) flags.push('Overdue');
  if (numeric(row.total_budget) === null || numeric(row.spent_cost) === null) flags.push('Missing cost data');
  if (!closedProject(row) && !dateKey(row.end_date)) flags.push('Missing end date');
  if (!closedProject(row) && !row.pm_id) flags.push('No project manager');
  return flags;
};
export const stock = (row: ReportRow) => numeric(row.current_stock ?? row.global_stock_quantity);
export const threshold = (row: ReportRow) => numeric(row.minimum_threshold ?? row.low_stock_threshold);
export const shortage = (row: ReportRow) => {
  const current = stock(row), minimum = threshold(row);
  return current === null || minimum === null ? null : Math.max(0, minimum - current);
};
export const stockFlag = (row: ReportRow) => {
  const current = stock(row), minimum = threshold(row);
  if (current === null) return 'Missing stock';
  if (current <= 0) return 'Out of stock';
  if (minimum === null) return 'Missing threshold';
  return current < minimum ? 'Low stock' : 'Within threshold';
};
export const openOrder = (row: ReportRow) => ['pending', 'pending delivery', 'confirmed', 'approved', 'processing', 'shipped', 'in transit'].includes(status(row.status));
export const lateOrder = (row: ReportRow, today = localDay()) => openOrder(row) && !!dateKey(row.expected_date) && dateKey(row.expected_date)! < today;
export const orderValue = (row: ReportRow) => {
  const total = numeric(row.total_price);
  if (total !== null) return total;
  const quantity = numeric(row.quantity_ordered), price = numeric(row.unit_price);
  return quantity === null || price === null ? null : quantity * price;
};
export const pendingPay = (row: ReportRow) => ['pending', 'unpaid', 'approved', 'generated', 'processing'].includes(status(row.status));
export const paidPay = (row: ReportRow) => status(row.status) === 'paid';
export function grouped(rows: ReportRow[], key: (row: ReportRow) => string, value?: (row: ReportRow) => number | null) {
  const result: Record<string, number> = {};
  for (const row of rows) {
    const n = value ? value(row) : 1;
    if (n !== null) result[key(row)] = (result[key(row)] || 0) + n;
  }
  return Object.entries(result).sort((a, b) => b[1] - a[1]);
}
export function csv(headers: string[], rows: string[][]) {
  const cell = (value: string) => `"${(/^[\s]*[=+\-@]/.test(value) ? "'" + value : value).replace(/"/g, '""')}"`;
  return '\uFEFF' + [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n');
}
