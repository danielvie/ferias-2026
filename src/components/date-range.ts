export interface DateRange {
  startDate: string;
  endDate: string;
}

export function selectRangeDate(range: DateRange, date: string): DateRange {
  if (!range.startDate || range.endDate) return { startDate: date, endDate: '' };
  return date < range.startDate
    ? { startDate: date, endDate: range.startDate }
    : { startDate: range.startDate, endDate: date };
}

function isoDate(date: Date): string {
  if (date.getUTCFullYear() < 1) return '0001-01-01';
  if (date.getUTCFullYear() > 9999) return '9999-12-31';
  return date.toISOString().slice(0, 10);
}

export function shiftDate(date: string, days: number): string {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return isoDate(next);
}

export function shiftMonth(date: string, months: number): string {
  const next = new Date(`${date}T12:00:00Z`);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months + 1);
  next.setUTCDate(0);
  next.setUTCDate(Math.min(day, next.getUTCDate()));
  return isoDate(next);
}

/** Sunday-first weeks, with empty cells outside the displayed month. */
export function calendarWeeks(month: string): (string | null)[][] {
  const first = new Date(`${month}-01T12:00:00Z`);
  const last = new Date(first);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  const count = last.getUTCDate();
  const offset = first.getUTCDay();
  return Array.from({ length: Math.ceil((offset + count) / 7) }, (_, week) =>
    Array.from({ length: 7 }, (_, weekday) => {
      const day = week * 7 + weekday - offset + 1;
      return day < 1 || day > count ? null : `${month}-${String(day).padStart(2, '0')}`;
    }));
}
