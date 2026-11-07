export function formatMoney(n: number): string {
  if (!n || isNaN(n)) return 'Rs. 0';
  if (n >= 1e9) return `Rs. ${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `Rs. ${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `Rs. ${(n / 1e3).toFixed(1)}K`;
  return `Rs. ${n.toLocaleString()}`;
}

export function getAttendanceStatus(record: {
  status?: string | null;
  check_in_time?: string | null;
  check_out_time?: string | null;
  hours_worked?: number | string | null;
} | null | undefined): string {
  if (!record) return 'Not scheduled';
  if (record.status) return record.status;
  if (record.check_in_time || record.check_out_time || (record.hours_worked != null && Number(record.hours_worked) > 0)) {
    return 'Present';
  }
  return 'Not scheduled';
}

export function calculateWorkedMinutes(
  hoursWorked: number | string | null | undefined,
  inTime?: string | null,
  outTime?: string | null
): number {
  if (inTime && outTime) {
    try {
      const start = new Date(inTime).getTime();
      const end = new Date(outTime).getTime();
      if (!isNaN(start) && !isNaN(end) && end >= start) {
        return Math.max(0, Math.round((end - start) / 60000));
      }
    } catch {
      // fallback to hoursWorked
    }
  }

  if (hoursWorked === null || hoursWorked === undefined || hoursWorked === '') {
    return 0;
  }

  const num = Number(hoursWorked);
  if (isNaN(num) || num <= 0) {
    return 0;
  }

  return Math.max(0, Math.round(num * 60));
}

export function calculateOvertimeMinutes(
  overtimeHours: number | string | null | undefined,
  hoursWorked?: number | string | null,
  inTime?: string | null,
  outTime?: string | null
): number {
  if (inTime && outTime) {
    const workedMinutes = calculateWorkedMinutes(hoursWorked, inTime, outTime);
    return Math.max(0, workedMinutes - 480);
  }

  if (overtimeHours !== null && overtimeHours !== undefined && overtimeHours !== '') {
    const num = Number(overtimeHours);
    if (!isNaN(num) && num >= 0) {
      return Math.round(num * 60);
    }
  }

  const workedMinutes = calculateWorkedMinutes(hoursWorked, inTime, outTime);
  return Math.max(0, workedMinutes - 480);
}

export function formatMinutes(totalMinutes: number | null | undefined): string {
  const mins = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

export function formatHoursMinutes(
  hoursWorked: number | string | null | undefined,
  inTime?: string | null,
  outTime?: string | null
): string {
  return formatMinutes(calculateWorkedMinutes(hoursWorked, inTime, outTime));
}

export function formatOvertimeHoursMinutes(
  overtimeHours: number | string | null | undefined,
  hoursWorked?: number | string | null,
  inTime?: string | null,
  outTime?: string | null
): string {
  return formatMinutes(calculateOvertimeMinutes(overtimeHours, hoursWorked, inTime, outTime));
}

export function sumWorkedMinutes(
  records: Array<{
    hours_worked?: number | string | null;
    check_in_time?: string | null;
    check_out_time?: string | null;
  }> | null | undefined
): number {
  if (!Array.isArray(records)) return 0;
  return records.reduce(
    (sum, r) => sum + calculateWorkedMinutes(r?.hours_worked, r?.check_in_time, r?.check_out_time),
    0
  );
}

export function sumOvertimeMinutes(
  records: Array<{
    overtime_hours?: number | string | null;
    hours_worked?: number | string | null;
    check_in_time?: string | null;
    check_out_time?: string | null;
  }> | null | undefined
): number {
  if (!Array.isArray(records)) return 0;
  return records.reduce(
    (sum, r) =>
      sum +
      calculateOvertimeMinutes(
        r?.overtime_hours,
        r?.hours_worked,
        r?.check_in_time,
        r?.check_out_time
      ),
    0
  );
}


