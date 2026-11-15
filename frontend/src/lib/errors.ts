export function getErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (typeof err === 'object' && err !== null && 'data' in err) {
    const detail = (err as { data?: { detail?: unknown } }).data?.detail;
    if (typeof detail === 'string') return detail;
  }
  return fallback;
}