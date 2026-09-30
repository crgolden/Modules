import type { ScenarioResult } from './scenario-results';

export const RUN_ENVIRONMENT_KEYS = {
  runId: 'GITHUB_RUN_ID',
  runAttempt: 'GITHUB_RUN_ATTEMPT',
  serverUrl: 'GITHUB_SERVER_URL',
  repository: 'GITHUB_REPOSITORY',
  sha: 'GITHUB_SHA',
  ref: 'GITHUB_REF',
  event: 'GITHUB_EVENT_NAME',
} as const;

const DIGITS_ONLY = /^\d+$/;

export const SqlCommands = {
  begin: 'BEGIN',
  commit: 'COMMIT',
  rollback: 'ROLLBACK',
} as const;

export interface RunIdentity {
  readonly app: string;
  readonly runId: string;
  readonly runAttempt: number;
  readonly runUrl: string;
  readonly gitSha: string;
  readonly gitRef: string;
  readonly event: string;
}

export interface Queryable {
  query(text: string, values?: unknown[]): Promise<unknown>;
}

export class MissingRunSettingError extends Error {
  constructor(readonly setting: string) {
    super(`${setting} is not set, so the run cannot be identified.`);
  }
}

export class NothingExecutedError extends Error {
  constructor() {
    super('The Cucumber messages hold no finished scenario, so there is no result to publish.');
  }
}

function requiredSetting(environment: NodeJS.ProcessEnv, key: string): string {
  const value = environment[key];
  if (value === undefined || value.trim().length === 0) {
    throw new MissingRunSettingError(key);
  }
  return value;
}

function positiveWholeNumber(environment: NodeJS.ProcessEnv, key: string): string {
  const value = requiredSetting(environment, key);
  if (!DIGITS_ONLY.test(value)) {
    throw new MissingRunSettingError(key);
  }
  return value;
}

export function runIdentityFromEnvironment(app: string, environment: NodeJS.ProcessEnv): RunIdentity {
  const runId = positiveWholeNumber(environment, RUN_ENVIRONMENT_KEYS.runId);
  const serverUrl = requiredSetting(environment, RUN_ENVIRONMENT_KEYS.serverUrl);
  const repository = requiredSetting(environment, RUN_ENVIRONMENT_KEYS.repository);
  return {
    app,
    runId,
    runAttempt: Number(positiveWholeNumber(environment, RUN_ENVIRONMENT_KEYS.runAttempt)),
    runUrl: new URL(`${repository}/actions/runs/${runId}`, `${serverUrl}/`).href,
    gitSha: requiredSetting(environment, RUN_ENVIRONMENT_KEYS.sha),
    gitRef: requiredSetting(environment, RUN_ENVIRONMENT_KEYS.ref),
    event: requiredSetting(environment, RUN_ENVIRONMENT_KEYS.event),
  };
}

const RUN_COLUMNS = ['app', 'run_id', 'run_attempt', 'run_url', 'git_sha', 'git_ref', 'event', 'started_at'];

const SCENARIO_COLUMNS = [
  'app',
  'run_id',
  'run_attempt',
  'test_case_started_id',
  'feature',
  'feature_uri',
  'rule',
  'scenario',
  'tags',
  'status',
  'attempt',
  'failed_step',
  'error_message',
  'started_at',
  'finished_at',
];

function parameter(position: number): string {
  return `$${position}`;
}

function rowPlaceholders(row: number, columnCount: number): string {
  const parameters = Array.from({ length: columnCount }, (_, column) => parameter(row * columnCount + column + 1));
  return `(${parameters.join(', ')})`;
}

function placeholders(rowCount: number, columnCount: number): string {
  return Array.from({ length: rowCount }, (_, row) => rowPlaceholders(row, columnCount)).join(', ');
}

function scenarioRow(run: RunIdentity, result: ScenarioResult): unknown[] {
  return [
    run.app,
    run.runId,
    run.runAttempt,
    result.testCaseStartedId,
    result.feature,
    result.featureUri,
    result.rule,
    result.scenario,
    result.tags,
    result.status,
    result.attempt,
    result.failedStep,
    result.errorMessage,
    result.startedAt,
    result.finishedAt,
  ];
}

export async function publishScenarioResults(
  client: Queryable,
  run: RunIdentity,
  runStartedAt: Date,
  results: readonly ScenarioResult[],
): Promise<void> {
  if (results.length === 0) {
    throw new NothingExecutedError();
  }
  await client.query(SqlCommands.begin);
  try {
    await client.query(
      `INSERT INTO runs (${RUN_COLUMNS.join(', ')}) VALUES ${placeholders(1, RUN_COLUMNS.length)}`,
      [run.app, run.runId, run.runAttempt, run.runUrl, run.gitSha, run.gitRef, run.event, runStartedAt],
    );
    await client.query(
      `INSERT INTO scenario_results (${SCENARIO_COLUMNS.join(', ')}) VALUES ${placeholders(results.length, SCENARIO_COLUMNS.length)}`,
      results.flatMap((result) => scenarioRow(run, result)),
    );
    await client.query(SqlCommands.commit);
  } catch (error) {
    await client.query(SqlCommands.rollback);
    throw error;
  }
}
