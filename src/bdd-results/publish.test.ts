import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  MissingRunSettingError,
  NothingExecutedError,
  POSTGRES_MAX_BIND_PARAMETERS,
  PickleStepTypes,
  RUN_ENVIRONMENT_KEYS,
  SqlCommands,
  TestStepResultStatuses,
  UNFINISHED_RUN,
  publishScenarioResults,
  rowsPerInsert,
  runIdentityFromEnvironment,
  type Queryable,
  type RunIdentity,
  type RunOutcome,
  type ScenarioResult,
  type StepResult,
} from './index';
import {
  APP_OPTION,
  OutsideWorkingDirectoryError,
  RunOutcomeDescriptions,
  UsageError,
  describeOutcome,
  messagesFileWithin,
  parsePublishCommand,
} from './cli';
import { newCount, newHttpsAddress, newId, newMemberOf, newText } from '../testing';

const INSERT_INTO_RUNS = /^INSERT INTO runs /;
const INSERT_INTO_SCENARIO_RESULTS = /^INSERT INTO scenario_results /;
const INSERT_INTO_STEP_RESULTS = /^INSERT INTO step_results /;

interface RecordedQuery {
  readonly text: string;
  readonly values: unknown[];
}

class RecordingClient implements Queryable {
  readonly queries: RecordedQuery[] = [];

  constructor(private readonly failOn: RegExp | null) {}

  query(text: string, values: unknown[] = []): Promise<unknown> {
    this.queries.push({ text, values });
    return this.failOn?.test(text) === true ? Promise.reject(new Error(newText())) : Promise.resolve();
  }
}

function newRunEnvironment(): NodeJS.ProcessEnv {
  return {
    [RUN_ENVIRONMENT_KEYS.runId]: String(newCount()),
    [RUN_ENVIRONMENT_KEYS.runAttempt]: String(newCount()),
    [RUN_ENVIRONMENT_KEYS.serverUrl]: newHttpsAddress(),
    [RUN_ENVIRONMENT_KEYS.repository]: `${newText()}/${newText()}`,
    [RUN_ENVIRONMENT_KEYS.sha]: newText(),
    [RUN_ENVIRONMENT_KEYS.ref]: `refs/heads/${newText()}`,
    [RUN_ENVIRONMENT_KEYS.event]: newText(),
  };
}

function newRun(): RunIdentity {
  return runIdentityFromEnvironment(newText(), newRunEnvironment());
}

function newStep(position: number): StepResult {
  return {
    position,
    type: newMemberOf(Object.values(PickleStepTypes)),
    text: newText(),
    status: TestStepResultStatuses.passed,
    startedAt: new Date(),
    finishedAt: new Date(),
    errorMessage: null,
  };
}

function newSteps(): StepResult[] {
  return Array.from({ length: newCount() }, (_, index) => newStep(index + 1));
}

function newResult(steps: readonly StepResult[] = newSteps()): ScenarioResult {
  return {
    testCaseStartedId: newId(),
    feature: newText(),
    featureUri: `${newText()}.feature`,
    rule: null,
    scenario: newText(),
    tags: [`@${newText()}`],
    status: TestStepResultStatuses.passed,
    attempt: 0,
    startedAt: new Date(),
    finishedAt: new Date(),
    failedStep: null,
    errorMessage: null,
    steps,
  };
}

function newFailedOutcome(): RunOutcome {
  return { finishedAt: new Date(), success: false, errorMessage: newText() };
}

const SUCCEEDED: RunOutcome = { finishedAt: new Date(), success: true, errorMessage: null };

function expectedRunValues(run: RunIdentity, startedAt: Date, outcome: RunOutcome): unknown[] {
  return [
    run.app,
    run.runId,
    run.runAttempt,
    run.runUrl,
    run.gitSha,
    run.gitRef,
    run.event,
    startedAt,
    outcome.finishedAt,
    outcome.success,
    outcome.errorMessage,
  ];
}

function expectedScenarioValues(run: RunIdentity, result: ScenarioResult): unknown[] {
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

function expectedStepValues(run: RunIdentity, result: ScenarioResult): unknown[] {
  return result.steps.flatMap((step) => [
    run.app,
    run.runId,
    run.runAttempt,
    result.testCaseStartedId,
    step.position,
    step.type,
    step.text,
    step.status,
    step.errorMessage,
    step.startedAt,
    step.finishedAt,
  ]);
}

function insertsInto(client: RecordingClient, table: RegExp): RecordedQuery[] {
  return client.queries.filter((query) => table.test(query.text));
}

test('the run identity comes from the GitHub Actions environment, with the run URL built from it', () => {
  const environment = newRunEnvironment();
  const app = newText();

  const run = runIdentityFromEnvironment(app, environment);

  assert.deepEqual(run, {
    app,
    runId: environment[RUN_ENVIRONMENT_KEYS.runId],
    runAttempt: Number(environment[RUN_ENVIRONMENT_KEYS.runAttempt]),
    runUrl: `${environment[RUN_ENVIRONMENT_KEYS.serverUrl]}/${environment[RUN_ENVIRONMENT_KEYS.repository]}/actions/runs/${environment[RUN_ENVIRONMENT_KEYS.runId]}`,
    gitSha: environment[RUN_ENVIRONMENT_KEYS.sha],
    gitRef: environment[RUN_ENVIRONMENT_KEYS.ref],
    event: environment[RUN_ENVIRONMENT_KEYS.event],
  });
});

test('a missing run setting is named rather than published as blank', () => {
  const missing = newMemberOf(Object.values(RUN_ENVIRONMENT_KEYS));
  const environment = { ...newRunEnvironment(), [missing]: undefined };

  assert.throws(
    () => runIdentityFromEnvironment(newText(), environment),
    (error: unknown) => error instanceof MissingRunSettingError && error.setting === missing,
  );
});

test('a run id that is not a whole number is refused', () => {
  const environment = { ...newRunEnvironment(), [RUN_ENVIRONMENT_KEYS.runId]: newText() };

  assert.throws(
    () => runIdentityFromEnvironment(newText(), environment),
    (error: unknown) => error instanceof MissingRunSettingError && error.setting === RUN_ENVIRONMENT_KEYS.runId,
  );
});

test('the run, every scenario and every step are inserted in one transaction, run first and steps last', async () => {
  const client = new RecordingClient(null);
  const run = newRun();
  const startedAt = new Date();
  const results = [newResult()];

  await publishScenarioResults(client, run, startedAt, SUCCEEDED, results);

  assert.equal(client.queries[0].text, SqlCommands.begin);
  assert.match(client.queries[1].text, INSERT_INTO_RUNS);
  assert.match(client.queries[2].text, INSERT_INTO_SCENARIO_RESULTS);
  assert.match(client.queries[3].text, INSERT_INTO_STEP_RESULTS);
  assert.equal(client.queries[4].text, SqlCommands.commit);
  assert.equal(client.queries.at(-1), client.queries[4]);
  assert.deepEqual(client.queries[1].values, expectedRunValues(run, startedAt, SUCCEEDED));
  assert.deepEqual(client.queries[2].values, results.flatMap((result) => expectedScenarioValues(run, result)));
  assert.deepEqual(client.queries[3].values, results.flatMap((result) => expectedStepValues(run, result)));
});

test('scenarios with no recorded steps insert no step rows', async () => {
  const client = new RecordingClient(null);

  await publishScenarioResults(client, newRun(), new Date(), SUCCEEDED, [newResult([])]);

  assert.deepEqual(insertsInto(client, INSERT_INTO_STEP_RESULTS), []);
});

test('rows beyond what one statement can bind are split across inserts, in order, none over the limit', async () => {
  const client = new RecordingClient(null);
  const run = newRun();
  const columnCount = expectedScenarioValues(run, newResult([])).length;
  const results = Array.from({ length: rowsPerInsert(columnCount) + newCount() }, () => newResult([]));

  await publishScenarioResults(client, run, new Date(), SUCCEEDED, results);

  const inserts = insertsInto(client, INSERT_INTO_SCENARIO_RESULTS);
  assert.equal(inserts.length, Math.ceil(results.length / rowsPerInsert(columnCount)));
  assert.deepEqual(inserts.flatMap((insert) => insert.values), results.flatMap((result) => expectedScenarioValues(run, result)));
  assert.equal(inserts.every((insert) => insert.values.length <= POSTGRES_MAX_BIND_PARAMETERS), true);
});

test('a run that did not succeed is published with its finish time, its failure and its error message', async () => {
  const client = new RecordingClient(null);
  const run = newRun();
  const startedAt = new Date();
  const outcome = newFailedOutcome();

  await publishScenarioResults(client, run, startedAt, outcome, [newResult()]);

  assert.deepEqual(client.queries[1].values, expectedRunValues(run, startedAt, outcome));
});

test('a run that did not finish is published with its scenarios, marked unfinished and unsuccessful', async () => {
  const client = new RecordingClient(null);
  const run = newRun();
  const startedAt = new Date();
  const results = [newResult()];

  await publishScenarioResults(client, run, startedAt, UNFINISHED_RUN, results);

  assert.deepEqual(client.queries[1].values, expectedRunValues(run, startedAt, UNFINISHED_RUN));
  assert.deepEqual(client.queries[2].values, results.flatMap((result) => expectedScenarioValues(run, result)));
  assert.equal(client.queries.at(-1)?.text, SqlCommands.commit);
});

test('a run that stopped before finishing any scenario is still published, as the run alone', async () => {
  const client = new RecordingClient(null);

  await publishScenarioResults(client, newRun(), new Date(), UNFINISHED_RUN, []);

  assert.match(client.queries[1].text, INSERT_INTO_RUNS);
  assert.deepEqual(
    client.queries.map((query) => query.text),
    [SqlCommands.begin, client.queries[1].text, SqlCommands.commit],
  );
});

test('a failed insert rolls the whole run back and reports the failure', async () => {
  const client = new RecordingClient(INSERT_INTO_SCENARIO_RESULTS);

  await assert.rejects(publishScenarioResults(client, newRun(), new Date(), SUCCEEDED, [newResult()]));

  assert.equal(client.queries[0].text, SqlCommands.begin);
  assert.match(client.queries[2].text, INSERT_INTO_SCENARIO_RESULTS);
  assert.equal(client.queries.at(-1)?.text, SqlCommands.rollback);
  assert.equal(client.queries.some((query) => query.text === SqlCommands.commit), false);
});

test('a run that reports success with no finished scenario is refused before anything is written', async () => {
  const client = new RecordingClient(null);

  await assert.rejects(publishScenarioResults(client, newRun(), new Date(), SUCCEEDED, []), NothingExecutedError);

  assert.deepEqual(client.queries, []);
});

test('an unfinished run is described as not finished, whatever it reports about success', () => {
  assert.equal(describeOutcome(UNFINISHED_RUN), RunOutcomeDescriptions.unfinished);
});

test('a finished run is described by whether it succeeded', () => {
  assert.equal(describeOutcome(SUCCEEDED), RunOutcomeDescriptions.succeeded);
  assert.equal(describeOutcome(newFailedOutcome()), RunOutcomeDescriptions.failed);
});

test('the command takes an app and exactly one messages file', () => {
  const app = newText();
  const messagesPath = `${newText()}.ndjson`;

  assert.deepEqual(parsePublishCommand([`--${APP_OPTION}`, app, messagesPath]), { app, messagesPath });
});

test('the command refuses to run without an app', () => {
  assert.throws(() => parsePublishCommand([`${newText()}.ndjson`]), UsageError);
});

test('the command refuses to run without a messages file', () => {
  assert.throws(() => parsePublishCommand([`--${APP_OPTION}`, newText()]), UsageError);
});

function newMessagesFile(directory: string): string {
  const messagesPath = join(directory, `${newText()}.ndjson`);
  writeFileSync(messagesPath, newText());
  return messagesPath;
}

test('a messages file inside the working directory is read from its canonical path', () => {
  const workingDirectory = mkdtempSync(join(tmpdir(), `${newText()}-`));
  const messagesPath = newMessagesFile(workingDirectory);

  const resolved = messagesFileWithin(workingDirectory, messagesPath);

  const expected = realpathSync(messagesPath);
  rmSync(workingDirectory, { recursive: true, force: true });
  assert.equal(resolved, expected);
});

test('a messages file outside the working directory is refused', () => {
  const workingDirectory = mkdtempSync(join(tmpdir(), `${newText()}-`));
  const elsewhere = mkdtempSync(join(tmpdir(), `${newText()}-`));
  const messagesPath = newMessagesFile(elsewhere);

  const attempt = (): string => messagesFileWithin(workingDirectory, messagesPath);

  assert.throws(attempt, OutsideWorkingDirectoryError);
  rmSync(workingDirectory, { recursive: true, force: true });
  rmSync(elsewhere, { recursive: true, force: true });
});

test('a sibling directory sharing the working directory name as a prefix is refused', () => {
  const workingDirectory = mkdtempSync(join(tmpdir(), `${newText()}-`));
  const sibling = `${workingDirectory}${newText()}`;
  mkdirSync(sibling);
  const messagesPath = newMessagesFile(sibling);

  const attempt = (): string => messagesFileWithin(workingDirectory, messagesPath);

  assert.throws(attempt, OutsideWorkingDirectoryError);
  rmSync(workingDirectory, { recursive: true, force: true });
  rmSync(sibling, { recursive: true, force: true });
});
