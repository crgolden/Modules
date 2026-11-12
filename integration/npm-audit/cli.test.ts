import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COMMAND_ENTRY_POINT, FAILED_EXIT_CODE, NPM_EXEC_PATH_VARIABLE, REPOSITORY_MARKER } from '../../src/npm-audit/cli';
import { newText } from '../../src/testing';

function emptyPackage(): string {
  const repositoryRoot = mkdtempSync(join(tmpdir(), `${newText()}-`));
  mkdirSync(join(repositoryRoot, REPOSITORY_MARKER));
  return repositoryRoot;
}

test('must-block: the installed command started without npm exits non-zero', () => {
  const packageRoot = emptyPackage();
  const environment = { ...process.env };
  delete environment[NPM_EXEC_PATH_VARIABLE];

  const run = spawnSync(process.execPath, [COMMAND_ENTRY_POINT], { cwd: packageRoot, env: environment });

  rmSync(packageRoot, { recursive: true, force: true });
  assert.equal(run.status, FAILED_EXIT_CODE);
});
