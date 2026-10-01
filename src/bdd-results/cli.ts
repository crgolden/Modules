#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { sep } from 'node:path';
import { parseArgs } from 'node:util';
import { Client } from 'pg';
import { publishScenarioResults, runIdentityFromEnvironment } from './publish';
import { parseEnvelopes, runOutcome, runStartedAt, toScenarioResults, type RunOutcome } from './scenario-results';

export const COMMAND_ENTRY_POINT = __filename;
export const APP_OPTION = 'app';
export const MESSAGES_ENCODING = 'utf8';

export class UsageError extends Error {}

export class OutsideWorkingDirectoryError extends Error {
  constructor(readonly messagesPath: string) {
    super(`${messagesPath} is outside the directory the command was started in, so it is not read.`);
  }
}

export function messagesFileWithin(workingDirectory: string, messagesPath: string): string {
  const resolved = realpathSync(messagesPath);
  const baseDirectory = realpathSync(workingDirectory);
  if (resolved !== baseDirectory && !resolved.startsWith(baseDirectory + sep)) {
    throw new OutsideWorkingDirectoryError(messagesPath);
  }
  return resolved;
}

export const RunOutcomeDescriptions = {
  unfinished: 'The run did not finish.',
  succeeded: 'The run succeeded.',
  failed: 'The run did not succeed.',
} as const;

export function describeOutcome(outcome: RunOutcome): string {
  if (outcome.finishedAt === null) {
    return RunOutcomeDescriptions.unfinished;
  }
  return outcome.success ? RunOutcomeDescriptions.succeeded : RunOutcomeDescriptions.failed;
}

export interface PublishCommand {
  readonly app: string;
  readonly messagesPath: string;
}

export function parsePublishCommand(args: readonly string[]): PublishCommand {
  const { values, positionals } = parseArgs({
    args: [...args],
    options: { [APP_OPTION]: { type: 'string' } },
    allowPositionals: true,
  });
  const app = values[APP_OPTION];
  const [messagesPath] = positionals;
  if (app === undefined || app.trim().length === 0 || messagesPath === undefined || positionals.length !== 1) {
    throw new UsageError(`Usage: publish-bdd-results --${APP_OPTION} <app> <cucumber-messages.ndjson>`);
  }
  return { app, messagesPath };
}

export async function runPublishCommand(args: readonly string[], environment: NodeJS.ProcessEnv): Promise<number> {
  const command = parsePublishCommand(args);
  const run = runIdentityFromEnvironment(command.app, environment);
  const envelopes = parseEnvelopes(await readFile(messagesFileWithin(process.cwd(), command.messagesPath), MESSAGES_ENCODING));
  const results = toScenarioResults(envelopes);
  const outcome = runOutcome(envelopes);
  const client = new Client();
  await client.connect();
  try {
    await publishScenarioResults(client, run, runStartedAt(envelopes), outcome, results);
  } finally {
    await client.end();
  }
  process.stdout.write(
    `Published ${results.length} scenario results for ${run.app} run ${run.runId}.${run.runAttempt}. ${describeOutcome(outcome)}\n`,
  );
  return 0;
}

if (require.main === module) {
  runPublishCommand(process.argv.slice(2), process.env).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    },
  );
}
