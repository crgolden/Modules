import { readFileSync } from 'node:fs';
import { chromium, type BrowserContext } from '@playwright/test';
import { CRGOLDEN_IDENTITY_ORIGIN, IDENTITY_LOGIN_PATH, installCredentialSerializationShim } from './index';

type SessionCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Lax';
};

const SESSION_COOKIE_NAME = '.AspNetCore.Identity.Application';

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

function readSessionCookies(origin: string): SessionCookie[] | null {
  const cookieFile = process.env['ENROLL_SESSION_COOKIE_FILE'];
  if (!cookieFile) {
    return null;
  }

  const text = readFileSync(cookieFile, 'utf8').trim();
  if (text === '') {
    throw new Error(`ENROLL_SESSION_COOKIE_FILE '${cookieFile}' is empty.`);
  }

  const shared = {
    domain: new URL(origin).hostname,
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax' as const,
  };

  if (text.startsWith('[')) {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      throw new Error(`ENROLL_SESSION_COOKIE_FILE '${cookieFile}' must hold a JSON array of {name, value}.`);
    }
    return parsed.map(entry => {
      const { name, value } = entry as { name?: unknown; value?: unknown };
      if (typeof name !== 'string' || typeof value !== 'string') {
        throw new Error('Every cookie in the file needs a string name and a string value.');
      }
      return { ...shared, name, value };
    });
  }

  return [{ ...shared, name: SESSION_COOKIE_NAME, value: text }];
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

    const sessionCookies = readSessionCookies(origin);
    if (sessionCookies) {
      await context.addCookies(sessionCookies);
      await page.goto(MANAGE_PASSKEYS_PATH);
      if (new URL(page.url()).pathname.startsWith(IDENTITY_LOGIN_PATH)) {
        throw new Error(
          `The transferred session did not authenticate ${email}: Identity redirected to the login page. The cookie is ` +
          'either expired, copied from a different account, or chunked - check for a second cookie whose name ends C2 ' +
          'and supply every chunk as a JSON array.');
      }
      process.stdout.write(`\nSession accepted for ${email}. Registering the passkey.\n\n`);
    }
    else {
      await page.goto(`${IDENTITY_LOGIN_PATH}?ReturnUrl=${encodeURIComponent(MANAGE_PASSKEYS_PATH)}`);

      process.stdout.write(
        `\nSign in as ${email} in the browser window that just opened.\n` +
        `Use Google if that account has it — reCAPTCHA v3 scores the browser, so password login cannot pass here.\n` +
        `This script waits for you, then registers the passkey and prints the credential.\n\n`);

      await page.waitForURL(url => url.pathname.startsWith(MANAGE_PASSKEYS_PATH), { timeout: ENROLLMENT_TIMEOUT_MS });
    }

    await Promise.all([
      page.waitForResponse(
        response => response.request().method() === 'POST'
          && new URL(response.url()).pathname.startsWith(MANAGE_PASSKEYS_PATH),
        { timeout: ENROLLMENT_TIMEOUT_MS }),
      page.click(ADD_PASSKEY_SELECTOR),
    ]);
    await page.waitForLoadState();

    const redirectedToRename = await page
      .waitForURL(url => url.pathname.startsWith(RENAME_PASSKEY_PATH), { timeout: ENROLLMENT_TIMEOUT_MS })
      .then(() => true, () => false);
    if (!redirectedToRename) {
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
