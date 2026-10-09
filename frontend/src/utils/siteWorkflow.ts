export function utcWorkDate() { return new Date().toISOString().slice(0, 10); }
export function validReportDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function positiveQuantity(value: string) {
  const quantity = Number(value);
  return value.trim() !== '' && Number.isFinite(quantity) && quantity > 0;
}
export function validWorkerCount(value: string) {
  return value.trim() === '' || (/^\d+$/.test(value.trim()) && Number.isSafeInteger(Number(value)));
}
