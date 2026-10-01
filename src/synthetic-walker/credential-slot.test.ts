import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CREDENTIAL_SLOTS, toCredentialSlot } from './index';
import { newCount } from '../testing';

test('every declared slot is accepted', () => {
  assert.deepEqual(CREDENTIAL_SLOTS.map(toCredentialSlot), [...CREDENTIAL_SLOTS]);
});

test('a slot no secret backs is refused', () => {
  const undeclared = Math.max(...CREDENTIAL_SLOTS) + newCount();

  assert.throws(() => toCredentialSlot(undeclared), new RegExp(String(undeclared)));
});
