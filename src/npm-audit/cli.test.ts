import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXCEPTIONS_FILE, noVerdictLine, staleLine, type AuditException } from './audit';
import {
  COMMAND_ENTRY_POINT,
  FAILED_EXIT_CODE,
  NPM_EXEC_PATH_VARIABLE,
  PASSED_EXIT_CODE,
  REPOSITORY_MARKER,
  auditDisabledLine,
  readExceptions,
  runAuditCheck,
  runNpmAudit,
} from './cli';
import { newCount, newCountCeiling, newText } from '../testing';

function emptyPackage(): string {
  const repositoryRoot = mkdtempSync(join(tmpdir(), `${newText()}-`));
  mkdirSync(join(repositoryRoot, REPOSITORY_MARKER));
  return repositoryRoot;
}

function projectSettingAudit(directory: string, value: boolean): string {
  const projectFile = join(directory, `${newText()}.esproj`);
  writeFileSync(projectFile, `<Project><PropertyGroup><ShouldRunNpmAudit>${value}</ShouldRunNpmAudit></PropertyGroup></Project>`);
  return projectFile;
}

function nestedPackage(repositoryRoot: string): string {
  const packageRoot = join(repositoryRoot, newText());
  mkdirSync(packageRoot);
  return packageRoot;
}

function packageWithException(exception: AuditException): string {
  const packageRoot = emptyPackage();
  writeFileSync(join(packageRoot, EXCEPTIONS_FILE), JSON.stringify([exception]));
  return packageRoot;
}

test('a package with no exceptions file has no exceptions', () => {
  const packageRoot = emptyPackage();

  const exceptions = readExceptions(packageRoot);

  rmSync(packageRoot, { recursive: true, force: true });
  assert.deepEqual(exceptions, []);
});

test('the command reads the exceptions file beside the package and fails a stale entry', () => {
  const today = new Date();
  const exception: AuditException = { advisory: `GHSA-${newText()}`, through: [newText()], expires: new Date(today.getTime() + newCount() * newCountCeiling()).toISOString(), reason: newText() };
  const packageRoot = packageWithException(exception);
  const printed: string[] = [];

  const exitCode = runAuditCheck(packageRoot, { vulnerabilities: {} }, today, (line) => printed.push(line));

  rmSync(packageRoot, { recursive: true, force: true });
  assert.equal(exitCode, FAILED_EXIT_CODE);
  assert.deepEqual(printed, [staleLine(exception)]);
});

test('control: the command passes a clean report in a package with no exceptions', () => {
  const packageRoot = emptyPackage();
  const printed: string[] = [];

  const exitCode = runAuditCheck(packageRoot, { vulnerabilities: {} }, new Date(), (line) => printed.push(line));

  rmSync(packageRoot, { recursive: true, force: true });
  assert.equal(exitCode, PASSED_EXIT_CODE);
  assert.deepEqual(printed, []);
});

test('must-block: a project file beside the package setting ShouldRunNpmAudit false fails a clean audit', () => {
  const packageRoot = emptyPackage();
  const projectFile = projectSettingAudit(packageRoot, false);
  const printed: string[] = [];

  const exitCode = runAuditCheck(packageRoot, { vulnerabilities: {} }, new Date(), (line) => printed.push(line));

  rmSync(packageRoot, { recursive: true, force: true });
  assert.equal(exitCode, FAILED_EXIT_CODE);
  assert.deepEqual(printed, [auditDisabledLine(projectFile)]);
});

test('must-block: a project file in an ancestor up to the repository root setting it false is found too', () => {
  const repositoryRoot = emptyPackage();
  const packageRoot = nestedPackage(repositoryRoot);
  const projectFile = projectSettingAudit(repositoryRoot, false);
  const printed: string[] = [];

  const exitCode = runAuditCheck(packageRoot, { vulnerabilities: {} }, new Date(), (line) => printed.push(line));

  rmSync(repositoryRoot, { recursive: true, force: true });
  assert.equal(exitCode, FAILED_EXIT_CODE);
  assert.deepEqual(printed, [auditDisabledLine(projectFile)]);
});

test('control: a project file keeping ShouldRunNpmAudit true passes a clean audit', () => {
  const packageRoot = emptyPackage();
  projectSettingAudit(packageRoot, true);
  const printed: string[] = [];

  const exitCode = runAuditCheck(packageRoot, { vulnerabilities: {} }, new Date(), (line) => printed.push(line));

  rmSync(packageRoot, { recursive: true, force: true });
  assert.equal(exitCode, PASSED_EXIT_CODE);
  assert.deepEqual(printed, []);
});

test('must-block: run outside npm, the audit has no report and the check is no verdict', () => {
  const packageRoot = emptyPackage();
  const printed: string[] = [];

  const exitCode = runAuditCheck(packageRoot, runNpmAudit(packageRoot, undefined), new Date(), (line) => printed.push(line));

  rmSync(packageRoot, { recursive: true, force: true });
  assert.equal(exitCode, FAILED_EXIT_CODE);
  assert.deepEqual(printed, [noVerdictLine()]);
});

test('must-block: the installed command started without npm exits non-zero', () => {
  const packageRoot = emptyPackage();
  const environment = { ...process.env };
  delete environment[NPM_EXEC_PATH_VARIABLE];

  const run = spawnSync(process.execPath, [COMMAND_ENTRY_POINT], { cwd: packageRoot, env: environment });

  rmSync(packageRoot, { recursive: true, force: true });
  assert.equal(run.status, FAILED_EXIT_CODE);
});
