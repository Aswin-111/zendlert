const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_NO_TZ_REGEX = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?$/;

const isValidDate = (value) => value instanceof Date && !Number.isNaN(value.getTime());

const toUtcDateOnly = (date) => {
  if (!isValidDate(date)) return null;
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  ));
};

const parseDateOnlyStringAsUtc = (value) => {
  const match = DATE_ONLY_REGEX.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (!isValidDate(parsed)) return null;

  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
};

const parseIsoWithoutTimezoneAsUtc = (value) => {
  const match = ISO_NO_TZ_REGEX.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? "0");
  const fractional = (match[7] ?? "").padEnd(3, "0").slice(0, 3);
  const millisecond = Number(fractional || "0");

  const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  if (!isValidDate(parsed)) return null;

  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
    || parsed.getUTCHours() !== hour
    || parsed.getUTCMinutes() !== minute
    || parsed.getUTCSeconds() !== second
  ) {
    return null;
  }

  return parsed;
};

export const normalizeIncomingDateTimeToUtc = (value) => {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    return isValidDate(value) ? new Date(value.getTime()) : null;
  }

  if (typeof value === "number") {
    const parsed = new Date(value);
    return isValidDate(parsed) ? parsed : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    // Keep date-only semantics stable at UTC midnight.
    const dateOnly = parseDateOnlyStringAsUtc(trimmed);
    if (dateOnly) return dateOnly;

    // Interpret ISO datetime without timezone as UTC to avoid server-local drift.
    const isoNoTz = parseIsoWithoutTimezoneAsUtc(trimmed);
    if (isoNoTz) return isoNoTz;

    const parsed = new Date(trimmed);
    return isValidDate(parsed) ? parsed : null;
  }

  return null;
};

export const normalizeIncomingDateOnlyToUtc = (value) => {
  if (value === null || value === undefined) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsedDateOnly = parseDateOnlyStringAsUtc(trimmed);
    if (parsedDateOnly) return parsedDateOnly;
  }

  const normalizedDateTime = normalizeIncomingDateTimeToUtc(value);
  return toUtcDateOnly(normalizedDateTime);
};

export const normalizeUnixSecondsToUtcDateTime = (seconds) => {
  const numericSeconds = Number(seconds);
  if (!Number.isFinite(numericSeconds)) return null;
  return normalizeIncomingDateTimeToUtc(numericSeconds * 1000);
};

export const normalizeUnixSecondsToUtcDateOnly = (seconds) => {
  const normalized = normalizeUnixSecondsToUtcDateTime(seconds);
  return toUtcDateOnly(normalized);
};

export const utcNow = () => new Date();
