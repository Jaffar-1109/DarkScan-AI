import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parseAppTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatAppTimestamp(
  value: string | null | undefined,
  options?: Intl.DateTimeFormatOptions
) {
  const parsed = parseAppTimestamp(value);
  if (!parsed) return 'Unknown';

  return parsed.toLocaleString(undefined, options ?? {
    dateStyle: 'medium',
    timeStyle: 'medium'
  });
}

export function isStrongPassword(password: string) {
  return /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}
