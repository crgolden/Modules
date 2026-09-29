import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import {
  CREDENTIAL_SLOTS,
  passkeyCredentialVariable,
  resolveStepBudget,
  resolveSyntheticAccount,
  SYNTHETIC_STEPS_VARIABLE,
  type PasskeyCredential,
} from './index';
import { newCount, newMemberOf, newText } from '../testing';

const SLOT = newMemberOf(CREDENTIAL_SLOTS);
const CREDENTIAL_VARIABLE = passkeyCredentialVariable(SLOT);

function newCredential(): PasskeyCredential {
  return { id: newText(), rpId: newText(), userHandle: newText(), privateKey: newText(), publicKey: newText() };
}

after(() => {
  delete process.env[CREDENTIAL_VARIABLE];
  delete process.env[SYNTHETIC_STEPS_VARIABLE];
});

test('a complete credential is read back', () => {
  const credential = newCredential();
  process.env[CREDENTIAL_VARIABLE] = JSON.stringify(credential);

  assert.deepEqual(resolveSyntheticAccount(SLOT).credential, credential);
});

test('a missing credential field is named', () => {
  const incomplete: Partial<PasskeyCredential> = newCredential();
  delete incomplete.rpId;
  process.env[CREDENTIAL_VARIABLE] = JSON.stringify(incomplete);

  assert.throws(() => resolveSyntheticAccount(SLOT), /rpId/);
});

test('an unset step count takes the configured default', () => {
  delete process.env[SYNTHETIC_STEPS_VARIABLE];
  const defaultSteps = newCount();

  assert.equal(resolveStepBudget({ defaultSteps, maxSteps: defaultSteps + newCount() }), defaultSteps);
});

test('a step count above the configured maximum is refused', () => {
  const maxSteps = newCount();
  process.env[SYNTHETIC_STEPS_VARIABLE] = String(maxSteps + newCount());

  assert.throws(() => resolveStepBudget({ defaultSteps: maxSteps, maxSteps }), new RegExp(String(maxSteps)));
});
