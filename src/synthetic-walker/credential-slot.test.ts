import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CREDENTIAL_SLOTS, toCredentialSlot } from './index';
import { newCount } from '../testing';

test('every declared slot is accepted', () => {
  for (const slot of CREDENTIAL_SLOTS) {
    assert.equal(toCredentialSlot(slot), slot);
  }
});

test('a slot no secret backs is refused', () => {
  const undeclared = Math.max(...CREDENTIAL_SLOTS) + newCount();

  assert.throws(() => toCredentialSlot(undeclared), new RegExp(String(undeclared)));
});
