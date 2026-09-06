import { chromium } from '@playwright/test';
import { CRGOLDEN_IDENTITY_ORIGIN, IDENTITY_LOGIN_PATH } from './index';

const MANAGE_PASSKEYS_PATH = '/Account/Manage/Passkeys';
const ADD_PASSKEY_SELECTOR = '#add-passkey';
const PASSKEY_ROW_SELECTOR = '[id^="passkey-row-"]';
const ENROLLMENT_TIMEOUT_MS = 300_000;

function refuseUnderAutomation(): void {
  if (process.env['CI']) {
    throw new Error(
      'Passkey enrollment is headed and operator-driven by design: it requires a human to pass the real reCAPTCHA, which is the whole point of not having a test-only bypass. It must never run in CI.');
  }
}

function resolveTarget(): { origin: string; email: string } {
  const origin = process.env['IDENTITY_ORIGIN'] ?? CRGOLDEN_IDENTITY_ORIGIN;
  const email = process.env['ENROLL_EMAIL'];
  if (!email) {
    throw new Error('ENROLL_EMAIL must be set to the account you are enrolling a passkey for.');
  }
  return { origin, email };
}

export async function enrollPasskey(): Promise<void> {
  refuseUnderAutomation();
  const { origin, email } = resolveTarget();
  const rpId = new URL(origin).hostname;

  const browser = await chromium.launch({ headless: false });
  try {
    const context = await browser.newContext({ baseURL: origin });
    await context.credentials.install();
    const credential = await context.credentials.create(rpId);

    const page = await context.newPage();
    await page.goto(`${IDENTITY_LOGIN_PATH}?ReturnUrl=${encodeURIComponent(MANAGE_PASSKEYS_PATH)}`);

    process.stdout.write(
      `\nSign in as ${email} in the browser window that just opened.\n` +
      `Use a password or Google — whichever that account has — and pass the real reCAPTCHA yourself.\n` +
      `This script waits for you, then registers the passkey and prints the credential.\n\n`);

    await page.waitForURL(url => url.pathname.startsWith(MANAGE_PASSKEYS_PATH), { timeout: ENROLLMENT_TIMEOUT_MS });
    const rowsBefore = await page.locator(PASSKEY_ROW_SELECTOR).count();
    await page.click(ADD_PASSKEY_SELECTOR);
    await page.waitForFunction(
      ([selector, before]) => document.querySelectorAll(selector as string).length > (before as number),
      [PASSKEY_ROW_SELECTOR, rowsBefore],
      { timeout: ENROLLMENT_TIMEOUT_MS });

    const stored = await context.credentials.get({ rpId });
    const registered = stored.find(candidate => candidate.id === credential.id);
    if (!registered) {
      throw new Error(
        'Identity accepted a passkey, but the authenticator no longer holds the credential this script seeded. ' +
        'Storing a different one would produce a secret that cannot sign in; refusing.');
    }

    process.stdout.write(
      `\nEnrollment complete. Store this verbatim as the repo's PASSKEY_CREDENTIAL<n> secret:\n\n` +
      `${JSON.stringify(registered)}\n\n` +
      `Then confirm Identity lists a passkey for ${email} under ${MANAGE_PASSKEYS_PATH}.\n`);
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  enrollPasskey().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
