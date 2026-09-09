import type { Page } from '@playwright/test';
import { CRGOLDEN_IDENTITY_ORIGIN, IDENTITY_LOGIN_PATH, submitPasskeyLogin } from './index';

const LOGIN_URL = `${CRGOLDEN_IDENTITY_ORIGIN}${IDENTITY_LOGIN_PATH}?ReturnUrl=%2F`;
const SIGNED_IN_URL = `${CRGOLDEN_IDENTITY_ORIGIN}/`;
const EMAIL = 'walker@example.invalid';

type StubOptions = {
  autofillWins: 'within-grace' | 'after-grace' | 'never';
  fillThrows?: boolean;
};

type Calls = { filled: boolean; clicked: boolean };

function stubPage(options: StubOptions): { page: Page; calls: Calls } {
  const calls: Calls = { filled: false, clicked: false };
  let current = LOGIN_URL;

  const page = {
    url: () => current,
    waitForURL: async (predicate: (url: URL) => boolean) => {
      if (options.autofillWins === 'within-grace') {
        current = SIGNED_IN_URL;
        if (!predicate(new URL(current))) {
          throw new Error('predicate rejected the signed-in url');
        }
        return;
      }
      throw new Error('Timeout exceeded');
    },
    fill: async () => {
      calls.filled = true;
      if (options.autofillWins === 'after-grace') {
        current = SIGNED_IN_URL;
      }
      if (options.fillThrows || options.autofillWins === 'after-grace') {
        throw new Error('Timeout 30000ms exceeded.');
      }
    },
    locator: () => ({
      click: async () => {
        calls.clicked = true;
      },
    }),
  } as unknown as Page;

  return { page, calls };
}

async function rejects(run: () => Promise<void>): Promise<boolean> {
  try {
    await run();
    return false;
  } catch {
    return true;
  }
}

function assert(condition: boolean, description: string): void {
  if (!condition) {
    throw new Error(`FAILED: ${description}`);
  }
}

async function main(): Promise<void> {
  const early = stubPage({ autofillWins: 'within-grace' });
  await submitPasskeyLogin(early.page, EMAIL);
  assert(!early.calls.filled, 'autofill inside the grace window must not touch the manual form');

  const late = stubPage({ autofillWins: 'after-grace' });
  assert(
    !(await rejects(() => submitPasskeyLogin(late.page, EMAIL))),
    'autofill landing after the grace window must not fail the walk');
  assert(late.calls.filled, 'the late case only proves anything if the manual path was attempted');

  const manual = stubPage({ autofillWins: 'never' });
  await submitPasskeyLogin(manual.page, EMAIL);
  assert(manual.calls.filled && manual.calls.clicked, 'with no autofill the manual path must run');

  const broken = stubPage({ autofillWins: 'never', fillThrows: true });
  assert(
    await rejects(() => submitPasskeyLogin(broken.page, EMAIL)),
    'a failure that leaves the page on the login screen must still throw');

  process.stdout.write('synthetic-walker: login race fixtures passed\n');
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
