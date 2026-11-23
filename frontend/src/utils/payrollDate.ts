/** Payroll calendar dates always follow the project's Sri Lanka timezone. */
export function payrollToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = (type: string) => parts.find(part => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export function payrollMonthStart(now = new Date()): string {
  return payrollToday(now).slice(0, 7) + '-01';
}
