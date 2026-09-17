/**
 * Formats a duration for human-facing output without changing stored millisecond data.
 * Sub-second values retain millisecond precision; longer values round to seconds and
 * compose larger units (for example, 500000 becomes "8m20s").
 */
export function formatDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    throw new RangeError("duration must be a non-negative finite number");
  }

  if (milliseconds < 1000) return `${Math.round(milliseconds)}ms`;

  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return [
    days > 0 ? `${days}d` : "",
    hours > 0 ? `${hours}h` : "",
    minutes > 0 ? `${minutes}m` : "",
    remainingSeconds > 0 ? `${remainingSeconds}s` : "",
  ].join("");
}
