const UINT32_RANGE = 2 ** 32;
const LOWERCASE_ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
const UPPERCASE_ALPHABET = LOWERCASE_ALPHABET.toUpperCase();
const DIGITS = '0123456789';
const TEXT_LENGTH = 12;
const SMALLEST_COUNT = 1;
const LARGEST_COUNT = 1000;
const LARGEST_COUNT_CEILING = 10000;
const SMALLEST_OTHER_TOKEN_LENGTH = 4;
const LARGEST_OTHER_TOKEN_LENGTH = 12;
const EMAIL_LOCAL_PART_LENGTH = 10;
const EMAIL_DOMAIN_LENGTH = 8;
const HOST_LENGTH = 12;
const PATH_SEGMENT_LENGTH = 8;
const NAME_FIRST_WORD_LENGTH = 6;
const NAME_SECOND_WORD_LENGTH = 8;
const LARGEST_MINUTES_AGO = 100000;
const MILLISECONDS_PER_MINUTE = 60000;
export const LARGEST_PERCENT = 100;

export function randomIntBetween(smallest: number, largestExclusive: number): number {
  const span = largestExclusive - smallest;
  if (!Number.isInteger(span) || span <= 0 || span > UINT32_RANGE) {
    throw new RangeError(`No integer lies in [${smallest}, ${largestExclusive}).`);
  }
  const unbiasedCeiling = UINT32_RANGE - (UINT32_RANGE % span);
  const draw = new Uint32Array(1);
  do {
    globalThis.crypto.getRandomValues(draw);
  } while (draw[0] >= unbiasedCeiling);
  return smallest + (draw[0] % span);
}

function tokenFrom(alphabet: string, length: number): string {
  return Array.from({ length }, () => alphabet[randomIntBetween(0, alphabet.length)]).join('');
}

export function lowercaseToken(length: number): string {
  return tokenFrom(LOWERCASE_ALPHABET, length);
}

export function uppercaseToken(length: number): string {
  return tokenFrom(UPPERCASE_ALPHABET, length);
}

export function digitToken(length: number): string {
  return tokenFrom(DIGITS, length);
}

export function newText(): string {
  return lowercaseToken(TEXT_LENGTH);
}

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

export function newCount(): number {
  return randomIntBetween(SMALLEST_COUNT, LARGEST_COUNT);
}

export function newCountCeiling(): number {
  return randomIntBetween(LARGEST_COUNT, LARGEST_COUNT_CEILING);
}

export function newPercent(): number {
  return randomIntBetween(0, LARGEST_PERCENT + 1);
}

export function newTokenOtherThan(...excluded: readonly string[]): string {
  let candidate: string;
  do {
    candidate = lowercaseToken(randomIntBetween(SMALLEST_OTHER_TOKEN_LENGTH, LARGEST_OTHER_TOKEN_LENGTH));
  } while (excluded.includes(candidate));
  return candidate;
}

export function newMemberOf<T>(values: readonly T[]): T {
  if (values.length === 0) {
    throw new RangeError('An empty set has no member to draw.');
  }
  return values[randomIntBetween(0, values.length)];
}

export function newMemberOtherThan<T>(values: readonly T[], excluded: T): T {
  return newMemberOf(values.filter((value) => value !== excluded));
}

export function newDisplayName(): string {
  return `${lowercaseToken(NAME_FIRST_WORD_LENGTH)} ${lowercaseToken(NAME_SECOND_WORD_LENGTH)}`;
}

export function newEmailAddress(): string {
  return `${lowercaseToken(EMAIL_LOCAL_PART_LENGTH)}@${lowercaseToken(EMAIL_DOMAIN_LENGTH)}.invalid`;
}

export function newHostname(): string {
  return `${lowercaseToken(HOST_LENGTH)}.example`;
}

export function newPathSegment(): string {
  return lowercaseToken(PATH_SEGMENT_LENGTH);
}

export function newHttpsAddress(host: string = newHostname()): string {
  return new URL(`/${newPathSegment()}`, `https://${host}`).href;
}

export function newUtcInstant(): string {
  return new Date(Date.now() - randomIntBetween(SMALLEST_COUNT, LARGEST_MINUTES_AGO) * MILLISECONDS_PER_MINUTE).toISOString();
}
