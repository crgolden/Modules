import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LARGEST_PERCENT,
  digitToken,
  lowercaseToken,
  newCount,
  newCountCeiling,
  newEmailAddress,
  newHttpsAddress,
  newHostname,
  newId,
  newMemberOf,
  newMemberOtherThan,
  newPercent,
  newText,
  newTokenOtherThan,
  newUtcInstant,
  randomIntBetween,
  uppercaseToken,
} from './index';

test('tokens draw only from their alphabet at the asked length', () => {
  const length = newCount();

  assert.match(lowercaseToken(length), new RegExp(`^[a-z]{${length}}$`));
  assert.match(uppercaseToken(length), new RegExp(`^[A-Z]{${length}}$`));
  assert.match(digitToken(length), new RegExp(`^[0-9]{${length}}$`));
});

test('a draw stays inside its half-open range', () => {
  const smallest = newCount();
  const largestExclusive = smallest + newCount();

  const draw = randomIntBetween(smallest, largestExclusive);

  assert.ok(draw >= smallest && draw < largestExclusive, `${draw} escaped [${smallest}, ${largestExclusive})`);
});

test('an empty range is refused rather than drawn from', () => {
  const bound = newCount();

  assert.throws(() => randomIntBetween(bound, bound), RangeError);
});

test('a count ceiling exceeds every count', () => {
  assert.ok(newCountCeiling() > newCount());
});

test('a percent lies on the whole scale', () => {
  const percent = newPercent();

  assert.ok(Number.isInteger(percent) && percent >= 0 && percent <= LARGEST_PERCENT, `${percent} is not a percent`);
});

test('an excluded token is never drawn', () => {
  const excluded = newText();

  assert.notEqual(newTokenOtherThan(excluded), excluded);
});

test('a member comes from the set and avoids the excluded one', () => {
  const values = [newText(), newText(), newText()];
  const excluded = newMemberOf(values);

  assert.ok(values.includes(newMemberOf(values)));
  assert.notEqual(newMemberOtherThan(values, excluded), excluded);
  assert.throws(() => newMemberOf([]), RangeError);
});

test('an email address uses the reserved invalid domain', () => {
  assert.match(newEmailAddress(), /^[a-z]+@[a-z]+\.invalid$/);
});

test('an address is https on the reserved example domain', () => {
  const host = newHostname();

  const address = newHttpsAddress(host);

  assert.ok(address.startsWith(`https://${host}/`), `${address} is not an https address on ${host}`);
  assert.match(newHostname(), /\.example$/);
});

test('an id is a version-four UUID', () => {
  assert.match(newId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('an instant is UTC and in the past', () => {
  const instant = newUtcInstant();

  assert.match(instant, /Z$/);
  assert.ok(Date.parse(instant) < Date.now());
});
