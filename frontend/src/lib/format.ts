const CURRENCY = 'ETB'; // change this one line for another currency

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: CURRENCY,
  maximumFractionDigits: 0,
});
const moneyCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: CURRENCY,
  notation: 'compact',
  maximumFractionDigits: 1,
});
const count = new Intl.NumberFormat('en-US');

export const formatMoney = (n: number) => money.format(n);
export const formatMoneyCompact = (n: number) => moneyCompact.format(n);
export const formatCount = (n: number) => count.format(n);

// Percent change versus the previous period. Returns null when there is nothing to compare.
export const pctChange = (current: number, previous: number): number | null =>
  previous === 0 ? null : ((current - previous) / previous) * 100;


// The API sends UTC times without a "Z". Without it the browser would read them
// as local time and show them hours off.
export const parseApiDate = (value: string): Date =>
  new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`);

export const formatDateTime = (value?: string | null): string =>
  value ? parseApiDate(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '-';

export function timeAgo(value?: string | null): string {
  if (!value) return 'Never';
  const seconds = Math.round((Date.now() - parseApiDate(value).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return formatDateTime(value);
}

export const initialsOf = (name?: string): string =>
  (name ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('') || '?';