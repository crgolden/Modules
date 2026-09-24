import assert from 'node:assert/strict';
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

function tokensDrawOnlyFromTheirAlphabetAtTheAskedLength(): void {
  const length = newCount();

  assert.match(lowercaseToken(length), new RegExp(`^[a-z]{${length}}$`));
  assert.match(uppercaseToken(length), new RegExp(`^[A-Z]{${length}}$`));
  assert.match(digitToken(length), new RegExp(`^[0-9]{${length}}$`));
}

function aDrawStaysInsideItsHalfOpenRange(): void {
  const smallest = newCount();
  const largestExclusive = smallest + newCount();

  const draw = randomIntBetween(smallest, largestExclusive);

  assert.ok(draw >= smallest && draw < largestExclusive, `${draw} escaped [${smallest}, ${largestExclusive})`);
}

function anEmptyRangeIsRefusedRatherThanDrawnFrom(): void {
  const bound = newCount();

  assert.throws(() => randomIntBetween(bound, bound), RangeError);
}

function aCountCeilingExceedsEveryCount(): void {
  assert.ok(newCountCeiling() > newCount());
}

function aPercentLiesOnTheWholeScale(): void {
  const percent = newPercent();

  assert.ok(Number.isInteger(percent) && percent >= 0 && percent <= LARGEST_PERCENT, `${percent} is not a percent`);
}

function anExcludedTokenIsNeverDrawn(): void {
  const excluded = newText();

  assert.notEqual(newTokenOtherThan(excluded), excluded);
}

function aMemberComesFromTheSetAndAvoidsTheExcludedOne(): void {
  const values = [newText(), newText(), newText()];
  const excluded = newMemberOf(values);

  assert.ok(values.includes(newMemberOf(values)));
  assert.notEqual(newMemberOtherThan(values, excluded), excluded);
  assert.throws(() => newMemberOf([]), RangeError);
}

function anEmailAddressUsesTheReservedInvalidDomain(): void {
  assert.match(newEmailAddress(), /^[a-z]+@[a-z]+\.invalid$/);
}

function anAddressIsHttpsOnTheReservedExampleDomain(): void {
  const host = newHostname();

  const address = newHttpsAddress(host);

  assert.ok(address.startsWith(`https://${host}/`), `${address} is not an https address on ${host}`);
  assert.match(newHostname(), /\.example$/);
}

function anIdIsAVersionFourUuid(): void {
  assert.match(newId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
}

function anInstantIsUtcAndInThePast(): void {
  const instant = newUtcInstant();

  assert.match(instant, /Z$/);
  assert.ok(Date.parse(instant) < Date.now());
}

tokensDrawOnlyFromTheirAlphabetAtTheAskedLength();
aDrawStaysInsideItsHalfOpenRange();
anEmptyRangeIsRefusedRatherThanDrawnFrom();
aCountCeilingExceedsEveryCount();
aPercentLiesOnTheWholeScale();
anExcludedTokenIsNeverDrawn();
aMemberComesFromTheSetAndAvoidsTheExcludedOne();
anEmailAddressUsesTheReservedInvalidDomain();
anAddressIsHttpsOnTheReservedExampleDomain();
anIdIsAVersionFourUuid();
anInstantIsUtcAndInThePast();
console.log('testing: every generator draws inside its declared shape');
