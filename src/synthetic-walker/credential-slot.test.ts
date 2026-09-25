import assert from 'node:assert/strict';
import { CREDENTIAL_SLOTS, toCredentialSlot } from './index';
import { newCount } from '../testing';

function everyDeclaredSlotIsAccepted(): void {
  for (const slot of CREDENTIAL_SLOTS) {
    assert.equal(toCredentialSlot(slot), slot);
  }
}

function aSlotNoSecretBacksIsRefused(): void {
  const undeclared = Math.max(...CREDENTIAL_SLOTS) + newCount();

  assert.throws(() => toCredentialSlot(undeclared), new RegExp(String(undeclared)));
}

everyDeclaredSlotIsAccepted();
aSlotNoSecretBacksIsRefused();
console.log('credential-slot: a configured slot is accepted only when it is a declared credential slot');
