import { test, type BrowserContext, type Locator, type Page, type TestInfo } from '@playwright/test';
import { VirtualAuthenticatorOptions, WebAuthnCommands } from './chrome-devtools-protocol-constants';
import { BASE64_QUANTUM_LENGTH, MILLISECONDS_PER_SECOND } from './encoding-constants';
import { CRGOLDEN_IDENTITY_ORIGIN, IDENTITY_LOGIN_PATH, IDENTITY_RETURN_URL_PARAMETER } from './identity-constants';
import { Mulberry32 } from './mulberry32-constants';

export { CRGOLDEN_IDENTITY_ORIGIN, IDENTITY_LOGIN_PATH, IDENTITY_RETURN_URL_PARAMETER };

export const SEED_ANNOTATION_TYPE = 'synthetic-seed';

export function identityLoginUrl(returnPath: string): string {
  return `${IDENTITY_LOGIN_PATH}?${IDENTITY_RETURN_URL_PARAMETER}=${encodeURIComponent(returnPath)}`;
}

export const DEFAULT_STEP_BUDGET = 40;
export const MAX_STEP_BUDGET = 500;

const UINT32_MAX = 0xffffffff;
const SEED_DECIMAL_PATTERN = /^\d{1,10}$/;

export interface Rng {
  next(): number;
  int(maxExclusive: number): number;
  pick<T>(items: readonly T[]): T;
  chance(probability: number): boolean;
}

export interface WalkerAction {
  name: string;
  weight: number;
  available(page: Page): Promise<boolean>;
  run(page: Page, rng: Rng): Promise<void>;
}

export interface WalkOptions {
  seed: number;
  steps: number;
  testInfo: TestInfo;
}

export interface WalkResult {
  executedSteps: number;
}

export const CREDENTIAL_SLOTS = [1, 2, 3] as const;

export type CredentialSlot = (typeof CREDENTIAL_SLOTS)[number];

export function toCredentialSlot(value: number): CredentialSlot {
  const slot = CREDENTIAL_SLOTS.find(candidate => candidate === value);
  if (slot === undefined) {
    throw new Error(`${value} is not a passkey credential slot; the slots are ${CREDENTIAL_SLOTS.join(', ')}.`);
  }
  return slot;
}

export interface PasskeyCredential {
  id: string;
  rpId: string;
  userHandle: string;
  privateKey: string;
  publicKey: string;
}

export interface SyntheticAccount {
  credential: PasskeyCredential;
}

export interface LoginOptions {
  slot: CredentialSlot;
  returnParam: 'returnUrl' | 'returnTo';
  returnPath: string;
  identityOrigin?: string;
}

export interface IdentityLoginOptions {
  slot: CredentialSlot;
  returnPath?: string;
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + Mulberry32.increment) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> Mulberry32.firstShift), t | Mulberry32.oddBit);
    t ^= t + Math.imul(t ^ (t >>> Mulberry32.secondShift), t | Mulberry32.mixMask);
    return ((t ^ (t >>> Mulberry32.thirdShift)) >>> 0) / Mulberry32.outputRange;
  };
}

export function createRng(seed: number): Rng {
  const next = mulberry32(seed);
  return {
    next,
    int: (maxExclusive: number) => Math.floor(next() * maxExclusive),
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) {
        throw new Error('Cannot pick from an empty list.');
      }
      return items[Math.floor(next() * items.length)];
    },
    chance: (probability: number) => next() < probability,
  };
}

export function resolveSeed(): number {
  const raw = process.env['SYNTHETIC_SEED'];
  if (!raw || !SEED_DECIMAL_PATTERN.test(raw)) {
    throw new Error('SYNTHETIC_SEED must be set to a decimal uint32 so every walk is replayable.');
  }
  const seed = Number(raw);
  if (!Number.isInteger(seed) || seed < 0 || seed > UINT32_MAX) {
    throw new Error(`SYNTHETIC_SEED must be a uint32; got ${raw}.`);
  }
  return seed >>> 0;
}

export function resolveStepBudget(defaultSteps: number = DEFAULT_STEP_BUDGET): number {
  const raw = process.env['SYNTHETIC_STEPS'];
  if (!raw) {
    return defaultSteps;
  }
  const steps = Number(raw);
  if (!Number.isInteger(steps) || steps < 1 || steps > MAX_STEP_BUDGET) {
    throw new Error(`SYNTHETIC_STEPS must be an integer between 1 and ${MAX_STEP_BUDGET}; got ${raw}.`);
  }
  return steps;
}

function requireString(source: Record<string, unknown>, field: string, envName: string): string {
  const value = source[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${envName} is missing the non-empty string field '${field}'.`);
  }
  return value;
}

export function resolveSyntheticAccount(slot: CredentialSlot): SyntheticAccount {
  const credentialName = `PASSKEY_CREDENTIAL${slot}`;
  const rawCredential = process.env[credentialName];
  if (!rawCredential) {
    throw new Error(`${credentialName} must be set for a synthetic walk.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawCredential);
  } catch (cause) {
    throw new Error(`${credentialName} is not valid JSON.`, { cause });
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`${credentialName} must be a JSON object holding the five passkey fields.`);
  }
  const fields = parsed as Record<string, unknown>;
  return {
    credential: {
      id: requireString(fields, 'id', credentialName),
      rpId: requireString(fields, 'rpId', credentialName),
      userHandle: requireString(fields, 'userHandle', credentialName),
      privateKey: requireString(fields, 'privateKey', credentialName),
      publicKey: requireString(fields, 'publicKey', credentialName),
    },
  };
}

const CREDENTIAL_SERIALIZATION_SHIM = `
(() => {
  const toBase64Url = buffer =>
    btoa(String.fromCharCode(...new Uint8Array(buffer)))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '');
  const buildJson = credential => {
    const source = credential.response;
    const response = source instanceof AuthenticatorAttestationResponse
      ? {
          clientDataJSON: toBase64Url(source.clientDataJSON),
          attestationObject: toBase64Url(source.attestationObject),
          transports: source.getTransports ? source.getTransports() : [],
        }
      : {
          clientDataJSON: toBase64Url(source.clientDataJSON),
          authenticatorData: toBase64Url(source.authenticatorData),
          signature: toBase64Url(source.signature),
          userHandle: source.userHandle ? toBase64Url(source.userHandle) : undefined,
        };
    return {
      id: credential.id,
      rawId: toBase64Url(credential.rawId),
      type: credential.type,
      authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
      clientExtensionResults: credential.getClientExtensionResults(),
      response,
    };
  };

  const withWorkingSerialization = credential => {
    if (credential) {
      Object.defineProperty(credential, 'toJSON', {
        configurable: true,
        writable: true,
        value: () => buildJson(credential),
      });
    }
    return credential;
  };

  const originalCreate = navigator.credentials.create.bind(navigator.credentials);
  const originalGet = navigator.credentials.get.bind(navigator.credentials);
  navigator.credentials.create = options => originalCreate(options).then(withWorkingSerialization);
  navigator.credentials.get = options => originalGet(options).then(withWorkingSerialization);
  window.__crgoldenCredentialShimInstalled = true;
})();
`;

export async function installCredentialSerializationShim(context: BrowserContext): Promise<void> {
  await context.addInitScript(CREDENTIAL_SERIALIZATION_SHIM);
}

function toStandardBase64(base64Url: string): string {
  const padding = (BASE64_QUANTUM_LENGTH - (base64Url.length % BASE64_QUANTUM_LENGTH)) % BASE64_QUANTUM_LENGTH;
  return base64Url.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat(padding);
}

export function monotonicSignCountSeed(now: number = Date.now()): number {
  return Math.floor(now / MILLISECONDS_PER_SECOND);
}

export async function seedPasskey(page: Page, credential: PasskeyCredential): Promise<void> {
  const context = page.context();
  const session = await context.newCDPSession(page);
  await session.send(WebAuthnCommands.disable);
  await session.send(WebAuthnCommands.enable);
  const { authenticatorId } = await session.send(WebAuthnCommands.addVirtualAuthenticator, {
    options: {
      protocol: VirtualAuthenticatorOptions.protocol,
      transport: VirtualAuthenticatorOptions.transport,
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await session.send(WebAuthnCommands.addCredential, {
    authenticatorId,
    credential: {
      credentialId: toStandardBase64(credential.id),
      isResidentCredential: true,
      rpId: credential.rpId,
      privateKey: toStandardBase64(credential.privateKey),
      userHandle: toStandardBase64(credential.userHandle),
      signCount: monotonicSignCountSeed(),
    },
  });
  await installCredentialSerializationShim(context);
}

export async function loginWithPasskey(page: Page, options: LoginOptions): Promise<void> {
  const { slot, returnParam, returnPath } = options;
  const identityOrigin = options.identityOrigin ?? CRGOLDEN_IDENTITY_ORIGIN;
  const { credential } = resolveSyntheticAccount(slot);
  await seedPasskey(page, credential);
  await page.goto(`/bff/login?${returnParam}=${encodeURIComponent(returnPath)}`);
  await page.waitForURL(url => url.origin !== identityOrigin && url.pathname.startsWith(returnPath));
  await waitForAngularHydration(page);
}

export async function loginToIdentityWithPasskey(page: Page, options: IdentityLoginOptions): Promise<void> {
  const returnPath = options.returnPath ?? '/';
  const { credential } = resolveSyntheticAccount(options.slot);
  await seedPasskey(page, credential);
  await page.goto(identityLoginUrl(returnPath));
  await page.waitForURL(url => !url.pathname.startsWith(IDENTITY_LOGIN_PATH));
}

export async function waitForAngularHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => document.querySelectorAll('[ngh]').length === 0);
}

export function prefixLocator(page: Page, idPrefix: string): Locator {
  return page.locator(`[id^="${idPrefix}"]`);
}

export async function hasPrefix(page: Page, idPrefix: string): Promise<boolean> {
  return (await prefixLocator(page, idPrefix).count()) > 0;
}

export async function pickFromPrefix(page: Page, rng: Rng, idPrefix: string): Promise<Locator> {
  const candidates = prefixLocator(page, idPrefix);
  await candidates.first().waitFor();
  const count = await candidates.count();
  if (count === 0) {
    throw new Error(`No elements match [id^="${idPrefix}"].`);
  }
  return candidates.nth(rng.int(count));
}

export async function isVisible(page: Page, selector: string): Promise<boolean> {
  return page.locator(selector).isVisible();
}

function pickWeighted(rng: Rng, actions: readonly WalkerAction[]): WalkerAction {
  const totalWeight = actions.reduce((sum, action) => sum + action.weight, 0);
  let remaining = rng.next() * totalWeight;
  for (const action of actions) {
    remaining -= action.weight;
    if (remaining < 0) {
      return action;
    }
  }
  return actions[actions.length - 1];
}

export async function walk(page: Page, actions: readonly WalkerAction[], options: WalkOptions): Promise<WalkResult> {
  const { seed, steps, testInfo } = options;
  const rng = createRng(seed);
  testInfo.annotations.push({ type: SEED_ANNOTATION_TYPE, description: String(seed) });
  let executedSteps = 0;
  for (let stepIndex = 1; stepIndex <= steps; stepIndex += 1) {
    await waitForAngularHydration(page);
    const availability = await Promise.all(actions.map(action => action.available(page)));
    const availableActions = actions.filter((_, index) => availability[index]);
    if (availableActions.length === 0) {
      throw new Error(`seed=${seed} step=${stepIndex}: no action is available at ${page.url()}; every walker needs at least one always-available action.`);
    }
    const action = pickWeighted(rng, availableActions);
    try {
      await test.step(`${stepIndex}/${steps}: ${action.name} [seed=${seed}] url=${page.url()}`, () => action.run(page, rng));
    } catch (cause) {
      throw new Error(`seed=${seed} step=${stepIndex} action=${action.name}: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
    }
    executedSteps += 1;
  }
  return { executedSteps };
}
