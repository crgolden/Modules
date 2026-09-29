#!/usr/bin/env node
import { checkDesignUtilities } from './check';

export const PASSED_EXIT_CODE = 0;
export const FAILED_EXIT_CODE = 1;
export const COMMAND_ENTRY_POINT = __filename;

export function runDesignUtilitiesCheck(repoRoot: string, print: (line: string) => void): number {
  const { passed, report } = checkDesignUtilities({ repoRoot });
  for (const line of report) {
    print(line);
  }
  return passed ? PASSED_EXIT_CODE : FAILED_EXIT_CODE;
}

if (require.main === module) {
  process.exitCode = runDesignUtilitiesCheck(process.cwd(), (line) => console.log(line));
}
