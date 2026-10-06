#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { EXCEPTIONS_FILE, evaluateAudit, type AuditException, type AuditReport } from './audit';

export const PASSED_EXIT_CODE = 0;
export const FAILED_EXIT_CODE = 1;
export const COMMAND_ENTRY_POINT = __filename;
export const NPM_EXEC_PATH_VARIABLE = 'npm_execpath';
export const AUDIT_ARGUMENTS = ['audit', '--json'] as const;

export const PROJECT_FILE_PATTERN = /\.(esproj|csproj|props|targets)$/;
export const AUDIT_DISABLED_PATTERN = /<ShouldRunNpmAudit>\s*false\s*<\/ShouldRunNpmAudit>/i;
export const REPOSITORY_MARKER = '.git';

export function auditDisabledLine(projectFile: string): string {
  return `FAIL ${projectFile} sets ShouldRunNpmAudit to false; the build's own npm audit must stay on`;
}

export function projectFilesDisablingAudit(packageRoot: string): string[] {
  const offenders: string[] = [];
  for (let directory = packageRoot; ; directory = dirname(directory)) {
    for (const name of readdirSync(directory).filter((entry) => PROJECT_FILE_PATTERN.test(entry))) {
      const path = join(directory, name);
      if (AUDIT_DISABLED_PATTERN.test(readFileSync(path, 'utf8'))) {
        offenders.push(path);
      }
    }
    if (existsSync(join(directory, REPOSITORY_MARKER)) || dirname(directory) === directory) {
      return offenders;
    }
  }
}

export function readExceptions(packageRoot: string): AuditException[] {
  const path = join(packageRoot, EXCEPTIONS_FILE);
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as AuditException[]) : [];
}

export function runNpmAudit(packageRoot: string, npmExecPath: string | undefined): AuditReport {
  if (npmExecPath === undefined) {
    return { error: `${NPM_EXEC_PATH_VARIABLE} is not set; run this command through npm (an npm script or npx)` };
  }
  const run = spawnSync(process.execPath, [npmExecPath, ...AUDIT_ARGUMENTS], { cwd: packageRoot, encoding: 'utf8' });
  try {
    return JSON.parse(run.stdout) as AuditReport;
  } catch {
    return { error: run.stderr };
  }
}

export function runAuditCheck(packageRoot: string, auditReport: AuditReport, today: Date, print: (line: string) => void): number {
  const { passed, report } = evaluateAudit(auditReport, readExceptions(packageRoot), today);
  const disabling = projectFilesDisablingAudit(packageRoot);
  for (const line of [...report, ...disabling.map(auditDisabledLine)]) {
    print(line);
  }
  return passed && disabling.length === 0 ? PASSED_EXIT_CODE : FAILED_EXIT_CODE;
}

if (require.main === module) {
  const packageRoot = process.cwd();
  process.exitCode = runAuditCheck(packageRoot, runNpmAudit(packageRoot, process.env[NPM_EXEC_PATH_VARIABLE]), new Date(), (line) => console.log(line));
}
