import { test, type Locator, type Page, type TestInfo } from '@playwright/test';

export const SYNTHETIC_MARKER_HEADER = 'X-Synthetic-Marker';
export const CRGOLDEN_IDENTITY_ORIGIN = 'https://crgolden-identity.azurewebsites.net';
export const SYNTHETIC_RECAPTCHA_TOKEN = 'synthetic-walker-token';

const RECAPTCHA_SCRIPT_URL_GLOB = 'https://www.google.com/recaptcha/**';
export const DEFAULT_STEP_BUDGET = 40;
export const MAX_STEP_BUDGET = 500;
export const DEFAULT_THINK_TIME_MS_RANGE: readonly [number, number] = [1500, 4000];
export const LOGIN_TIMEOUT_MS = 30_000;
export const HYDRATION_TIMEOUT_MS = 30_000;

const UINT32_MAX = 0xffffffff;
const UINT32_RANGE = 2 ** 32;
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
  thinkTimeMsRange?: readonly [number, number];
}

export interface WalkResult {
  executedSteps: number;
}

export interface SyntheticCredentials {
  username: string;
  password: string;
  marker: string;
}

export interface LoginOptions {
  returnParam: 'returnUrl' | 'returnTo';
  returnPath: string;
  identityOrigin?: string;
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
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

export function resolveSyntheticCredentials(): SyntheticCredentials {
  const username = process.env['TEST_USERNAME'];
  const password = process.env['TEST_PASSWORD'];
  const marker = process.env['SYNTHETIC_MARKER'];
  if (!username || !password || !marker) {
    throw new Error('TEST_USERNAME, TEST_PASSWORD, and SYNTHETIC_MARKER must all be set for a synthetic walk.');
  }
  return { username, password, marker };
}

export async function loginThroughIdentity(page: Page, options: LoginOptions): Promise<void> {
  const { username, password, marker } = resolveSyntheticCredentials();
  const { returnParam, returnPath } = options;
  const identityOrigin = options.identityOrigin ?? CRGOLDEN_IDENTITY_ORIGIN;
  await page.context().route(`${identityOrigin}/**`, route =>
    route.continue({ headers: { ...route.request().headers(), [SYNTHETIC_MARKER_HEADER]: marker } }));
  await page.context().addInitScript(
    token => {
      (globalThis as { grecaptcha?: unknown }).grecaptcha = {
        ready: (callback: () => void) => callback(),
        execute: () => Promise.resolve(token),
      };
    },
    SYNTHETIC_RECAPTCHA_TOKEN);
  await page.context().route(RECAPTCHA_SCRIPT_URL_GLOB, route => route.abort());
  await page.goto(`/bff/login?${returnParam}=${encodeURIComponent(returnPath)}`);
  await page.fill("input[name='Input.Email']", username);
  await page.fill("input[name='Input.Password']", password);
  await page.click('#login-submit');
  await page.waitForURL(url => url.origin !== identityOrigin && url.pathname.startsWith(returnPath), { timeout: LOGIN_TIMEOUT_MS });
  await waitForAngularHydration(page);
}

export async function waitForAngularHydration(page: Page, timeoutMs: number = HYDRATION_TIMEOUT_MS): Promise<void> {
  await page.waitForFunction(() => document.querySelectorAll('[ngh]').length === 0, undefined, { timeout: timeoutMs });
}

export function prefixLocator(page: Page, idPrefix: string): Locator {
  return page.locator(`[id^="${idPrefix}"]`);
}

export async function hasPrefix(page: Page, idPrefix: string): Promise<boolean> {
  return (await prefixLocator(page, idPrefix).count()) > 0;
}

export async function pickFromPrefix(page: Page, rng: Rng, idPrefix: string): Promise<Locator> {
  const candidates = prefixLocator(page, idPrefix);
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
  const [thinkMin, thinkMax] = options.thinkTimeMsRange ?? DEFAULT_THINK_TIME_MS_RANGE;
  const rng = createRng(seed);
  testInfo.annotations.push({ type: 'synthetic-seed', description: String(seed) });
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
    await page.waitForTimeout(thinkMin + rng.int(thinkMax - thinkMin));
  }
  return { executedSteps };
}
