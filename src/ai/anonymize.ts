/**
 * Student names never leave the server. Before a prompt is sent, every occurrence of the
 * student's full name and each name part is replaced with "the student"; after the response is
 * validated, the first name is put back so the educator sees a personalised document.
 */
const PLACEHOLDER = 'the student';
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface Anonymizer {
  scrub(text: string | undefined | null): string;
  restore<T>(value: T): T;
}

export function createAnonymizer(fullName: string): Anonymizer {
  const parts = fullName
    .split(/\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2);
  // Longest first so "Aarav Sharma" is replaced before "Aarav".
  const needles = [fullName.trim(), ...parts].filter(Boolean).sort((a, b) => b.length - a.length);
  const pattern = needles.length
    ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${needles.map(escape).join('|')})(?:'s)?(?![\\p{L}\\p{N}])`, 'giu')
    : null;
  const firstName = parts[0] ?? fullName.trim();

  const restoreString = (s: string) =>
    s
      .replace(/\bThe student's\b/g, `${firstName}'s`)
      .replace(/\bthe student's\b/g, `${firstName}'s`)
      .replace(/\bThe student\b/g, firstName)
      .replace(/\bthe student\b/g, firstName);

  const restoreDeep = (v: unknown): unknown => {
    if (typeof v === 'string') return restoreString(v);
    if (Array.isArray(v)) return v.map(restoreDeep);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, restoreDeep(x)]));
    return v;
  };

  return {
    scrub: (text) => (text && pattern ? text.replace(pattern, (m) => (m.endsWith("'s") ? `${PLACEHOLDER}'s` : PLACEHOLDER)) : text ?? ''),
    restore: <T>(value: T) => restoreDeep(value) as T,
  };
}

/** For flows with no known learner: strip obvious personal identifiers from free text. */
export function scrubContactDetails(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    .replace(/(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g, '[phone]')
    .replace(/\b\d{4}\s?\d{4}\s?\d{4}\b/g, '[id-number]'); // Aadhaar-like 12-digit numbers
}
