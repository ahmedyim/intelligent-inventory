export const methodLabel = (code: string) =>
  code.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

// "2026-11-30" (a date, not a moment): read it as local midnight so it never shifts a day
export const formatDay = (value?: string | null) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { dateStyle: 'medium' }) : '-';

export function formatRange(start?: string | null, end?: string | null): string {
  if (!start && !end) return 'All time';
  if (start && end && start === end) return formatDay(start);
  return `${start ? formatDay(start) : 'Beginning'} - ${end ? formatDay(end) : 'Today'}`;
}

const todayLocal = () => new Date().toLocaleDateString('en-CA'); // "YYYY-MM-DD"

export const isOverdue = (status: string, balance: number, due?: string | null) =>
  String(status).toUpperCase() === 'COMPLETED' && balance > 0 && !!due && due < todayLocal();