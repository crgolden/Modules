import { chromium, type BrowserContext } from '@playwright/test';
import { CRGOLDEN_IDENTITY_ORIGIN, IDENTITY_LOGIN_PATH, installCredentialSerializationShim } from './index';

const MANAGE_PASSKEYS_PATH = '/Account/Manage/Passkeys';
const RENAME_PASSKEY_PATH = '/Account/Manage/RenamePasskey';
const ADD_PASSKEY_SELECTOR = '#add-passkey';
const STATUS_MESSAGE_SELECTOR = '#status-message';
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

async function installEmptyAuthenticator(context: BrowserContext, rpId: string): Promise<void> {
  await context.credentials.install();
  const alreadyPresent = await context.credentials.get({ rpId });
  if (alreadyPresent.length > 0) {
    throw new Error(
      'The virtual authenticator must be empty until the operator has signed in. A credential seeded up front lets the ' +
      "login page's conditional-mediation autofill submit an assertion Identity has never seen, which re-renders Login " +
      'and reloads forever. The passkey is minted by the Add passkey button, never seeded here.');
  }
}

export async function enrollPasskey(): Promise<void> {
  refuseUnderAutomation();
  const { origin, email } = resolveTarget();
  const rpId = new URL(origin).hostname;

  const browser = await chromium.launch({ headless: false });
  try {
    const context = await browser.newContext({ baseURL: origin });
    await installEmptyAuthenticator(context, rpId);
    await installCredentialSerializationShim(context);

    const page = await context.newPage();
    page.on('console', message => {
      if (message.type() === 'error') {
        process.stderr.write(`[page error] ${message.text()}\n`);
      }
    });
    page.on('requestfailed', request => {
      process.stderr.write(`[request failed] ${request.url()} - ${request.failure()?.errorText ?? 'unknown'}\n`);
    });
    page.on('response', response => {
      if (response.status() >= 400) {
        process.stderr.write(`[http ${response.status()}] ${response.url()}\n`);
      }
    });

    await page.goto(`${IDENTITY_LOGIN_PATH}?ReturnUrl=${encodeURIComponent(MANAGE_PASSKEYS_PATH)}`);

    process.stdout.write(
      `\nSign in as ${email} in the browser window that just opened.\n` +
      `Use a password or Google — whichever that account has — and pass the real reCAPTCHA yourself.\n` +
      `This script waits for you, then registers the passkey and prints the credential.\n\n`);

    await page.waitForURL(url => url.pathname.startsWith(MANAGE_PASSKEYS_PATH), { timeout: ENROLLMENT_TIMEOUT_MS });
    await page.click(ADD_PASSKEY_SELECTOR);

    const registrationSucceeded = page
      .waitForURL(url => url.pathname.startsWith(RENAME_PASSKEY_PATH), { timeout: ENROLLMENT_TIMEOUT_MS })
      .then(() => true, () => false);
    const registrationReported = page
      .locator(STATUS_MESSAGE_SELECTOR)
      .waitFor({ timeout: ENROLLMENT_TIMEOUT_MS })
      .then(() => false, () => false);
    await Promise.race([registrationSucceeded, registrationReported]);

    if (!new URL(page.url()).pathname.startsWith(RENAME_PASSKEY_PATH)) {
      const reported = await page.locator(STATUS_MESSAGE_SELECTOR).innerText();
      throw new Error(`Identity refused the passkey: ${reported.trim()}`);
    }

    const stored = await context.credentials.get({ rpId });
    if (stored.length !== 1) {
      throw new Error(
        `Identity registered a passkey, but the authenticator holds ${stored.length} credentials for ${rpId} rather than ` +
        'the one the Add passkey button just minted. Storing the wrong one would produce a secret that cannot sign in; refusing.');
    }
    const [registered] = stored;

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
