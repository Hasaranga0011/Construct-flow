export function formatMoney(n: number): string {
  if (!n || isNaN(n)) return 'Rs. 0';
  if (n >= 1e9) return `Rs. ${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `Rs. ${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `Rs. ${(n / 1e3).toFixed(1)}K`;
  return `Rs. ${n.toLocaleString()}`;
}

export function formatHoursMinutes(
  hoursWorked: number | string | null | undefined,
  inTime?: string | null,
  outTime?: string | null
): string {
  // If actual check-in and check-out timestamps are provided, calculate real elapsed time
  if (inTime && outTime) {
    try {
      const start = new Date(inTime).getTime();
      const end = new Date(outTime).getTime();
      if (!isNaN(start) && !isNaN(end) && end >= start) {
        const totalMinutes = Math.round((end - start) / 60000);
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        return `${h}h ${m}m`;
      }
    } catch {
      // fallback to hoursWorked
    }
  }

  if (hoursWorked === null || hoursWorked === undefined || hoursWorked === '') {
    return '0h 0m';
  }

  const num = Number(hoursWorked);
  if (isNaN(num) || num <= 0) {
    return '0h 0m';
  }

  const totalMinutes = Math.round(num * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;

  return `${h}h ${m}m`;
}

