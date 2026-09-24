import { useEffect, useState } from 'react';
import { formatTemplate, type Messages } from '../i18n';

// Ticks every `intervalMs` so countdowns from expires_at stay live.
export function useNow(intervalMs = 30000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function hoursLeftFrom(expiresAtIso: string, now: number): number {
  return (new Date(expiresAtIso).getTime() - now) / (60 * 60 * 1000);
}

export function formatCountdown(hoursLeft: number, countdown: Messages['countdown']): string {
  if (hoursLeft <= 0) {
    return countdown.expired;
  }
  const totalMinutes = Math.floor(hoursLeft * 60);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) {
    return formatTemplate(countdown.remainingDaysHours, { days, hours });
  }
  if (hours > 0) {
    return formatTemplate(countdown.remainingHoursMinutes, { hours, minutes });
  }
  return formatTemplate(countdown.remainingMinutes, { minutes });
}
