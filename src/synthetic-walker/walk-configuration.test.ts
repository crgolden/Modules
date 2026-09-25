import assert from 'node:assert/strict';
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

function aCompleteCredentialIsReadBack(): void {
  const credential = newCredential();
  process.env[CREDENTIAL_VARIABLE] = JSON.stringify(credential);

  assert.deepEqual(resolveSyntheticAccount(SLOT).credential, credential);
}

function aMissingFieldIsNamed(): void {
  const incomplete: Partial<PasskeyCredential> = newCredential();
  delete incomplete.rpId;
  process.env[CREDENTIAL_VARIABLE] = JSON.stringify(incomplete);

  assert.throws(() => resolveSyntheticAccount(SLOT), /rpId/);
}

function anUnsetStepCountTakesTheConfiguredDefault(): void {
  delete process.env[SYNTHETIC_STEPS_VARIABLE];
  const defaultSteps = newCount();

  assert.equal(resolveStepBudget({ defaultSteps, maxSteps: defaultSteps + newCount() }), defaultSteps);
}

function aStepCountAboveTheConfiguredMaximumIsRefused(): void {
  const maxSteps = newCount();
  process.env[SYNTHETIC_STEPS_VARIABLE] = String(maxSteps + newCount());

  assert.throws(() => resolveStepBudget({ defaultSteps: maxSteps, maxSteps }), new RegExp(String(maxSteps)));
}

aCompleteCredentialIsReadBack();
aMissingFieldIsNamed();
anUnsetStepCountTakesTheConfiguredDefault();
aStepCountAboveTheConfiguredMaximumIsRefused();
delete process.env[CREDENTIAL_VARIABLE];
delete process.env[SYNTHETIC_STEPS_VARIABLE];
console.log('walk-configuration: credentials and step budgets are read from configuration, and refused when out of shape');
