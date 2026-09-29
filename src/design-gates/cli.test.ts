import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUILT_DIRECTORY, SOURCE_DIRECTORY, THEME_STYLESHEET, checkDesignUtilities } from './check';
import { COMMAND_ENTRY_POINT, FAILED_EXIT_CODE, PASSED_EXIT_CODE, runDesignUtilitiesCheck } from './cli';
import { newText } from '../testing';

interface UnbuiltApp {
  readonly repoRoot: string;
  readonly utility: string;
  readonly token: string;
}

function unbuiltApp(): UnbuiltApp {
  const repoRoot = mkdtempSync(join(tmpdir(), `${newText()}-`));
  const token = `--color-${newText()}`;
  const utility = newText();
  mkdirSync(join(repoRoot, SOURCE_DIRECTORY));
  writeFileSync(join(repoRoot, SOURCE_DIRECTORY, THEME_STYLESHEET), `@theme {\n  ${token}: oklch(0.5 0 0);\n}\n`);
  writeFileSync(join(repoRoot, SOURCE_DIRECTORY, `${newText()}.html`), `<div class="${utility}"></div>`);
  return { repoRoot, utility, token };
}

function builtApp(): string {
  const { repoRoot, utility, token } = unbuiltApp();
  mkdirSync(join(repoRoot, BUILT_DIRECTORY));
  writeFileSync(join(repoRoot, BUILT_DIRECTORY, `${newText()}.css`), `.${utility}{color:var(${token})}`);
  return repoRoot;
}

test('the command exits clean for a built app whose classes and tokens ship', () => {
  const repoRoot = builtApp();
  const printed: string[] = [];

  const exitCode = runDesignUtilitiesCheck(repoRoot, (line) => printed.push(line));

  rmSync(repoRoot, { recursive: true, force: true });
  assert.equal(exitCode, PASSED_EXIT_CODE, printed.join('\n'));
});

test('the command prints the whole report and exits non-zero for an app with no build', () => {
  const { repoRoot } = unbuiltApp();
  const printed: string[] = [];
  const expectedReport = checkDesignUtilities({ repoRoot }).report;

  const exitCode = runDesignUtilitiesCheck(repoRoot, (line) => printed.push(line));

  rmSync(repoRoot, { recursive: true, force: true });
  assert.equal(exitCode, FAILED_EXIT_CODE);
  assert.deepEqual(printed, expectedReport);
});

test('the installed command checks the app it is started in and passes a built one', () => {
  const repoRoot = builtApp();

  const run = spawnSync(process.execPath, [COMMAND_ENTRY_POINT], { cwd: repoRoot });

  rmSync(repoRoot, { recursive: true, force: true });
  assert.equal(run.status, PASSED_EXIT_CODE);
});

test('the installed command exits non-zero in an app with no build', () => {
  const { repoRoot } = unbuiltApp();

  const run = spawnSync(process.execPath, [COMMAND_ENTRY_POINT], { cwd: repoRoot });

  rmSync(repoRoot, { recursive: true, force: true });
  assert.equal(run.status, FAILED_EXIT_CODE);
});
