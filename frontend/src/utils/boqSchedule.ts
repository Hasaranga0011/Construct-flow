export interface EditableMilestone {
  title: string;
  description: string;
  due_date: string;
  duration_days: number;
  allocated_budget?: number;
  boq_stage?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidYMD(value?: string | null): boolean {
  if (!value || !DATE_RE.test(value.trim())) return false;
  const d = new Date(`${value.trim()}T00:00:00`);
  return !isNaN(d.getTime());
}

export function addDaysToYMD(baseYMD: string, days: number): string {
  const [y, m, d] = baseYMD.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + Math.max(1, Math.round(days)));
  return dt.toISOString().split('T')[0];
}

export function getTodayYMD(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Given a start date (YYYY-MM-DD) and a list of milestones with `duration_days`,
 * computes sequential `due_date`s for every milestone and the overall project `endDate`.
 */
export function recalculateScheduleFromStart(
  startDateStr: string,
  milestones: EditableMilestone[],
): { startDate: string; endDate: string; milestones: EditableMilestone[] } {
  const validStart = isValidYMD(startDateStr) ? startDateStr.trim() : getTodayYMD();

  if (!milestones || milestones.length === 0) {
    return {
      startDate: validStart,
      endDate: addDaysToYMD(validStart, 180),
      milestones: [],
    };
  }

  let cursor = validStart;
  const updated = milestones.map((m) => {
    const dur = Number(m.duration_days) > 0 ? Math.round(Number(m.duration_days)) : 21;
    cursor = addDaysToYMD(cursor, dur);
    return {
      ...m,
      duration_days: dur,
      due_date: cursor,
    };
  });

  return {
    startDate: validStart,
    endDate: cursor,
    milestones: updated,
  };
}

/**
 * Converts parsed BOQ milestones into editable milestones and computes their sequential due dates
 * and total project end date starting from `startDateStr` (or today if not yet set).
 */
export function seedMilestonesFromBoq(
  boqMilestones: any[],
  startDateStr?: string,
): { startDate: string; endDate: string; milestones: EditableMilestone[] } {
  const validStart = isValidYMD(startDateStr) ? startDateStr!.trim() : getTodayYMD();
  const rawList: EditableMilestone[] = (boqMilestones || []).map((m: any) => ({
    title: String(m.title || '').trim(),
    boq_stage: String(m.boq_stage || m.title || '').trim(),
    description: String(m.description || '').trim(),
    duration_days: Number(m.duration_days) > 0 ? Math.round(Number(m.duration_days)) : 21,
    due_date: '',
    allocated_budget: Number(m.allocated_budget) > 0 ? Number(m.allocated_budget) : undefined,
  }));

  return recalculateScheduleFromStart(validStart, rawList);
}

