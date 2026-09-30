import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MalformedMessagesError,
  TEST_STEP_RESULT_STATUSES,
  TestStepResultStatuses,
  parseEnvelopes,
  runStartedAt,
  toInstant,
  toScenarioResults,
  worstStatus,
  type Envelope,
  type TestStepResultStatus,
  type Timestamp,
} from './index';
import { newCount, newId, newMemberOf, newText, randomIntBetween } from '../testing';

interface RecordedStep {
  readonly status: TestStepResultStatus;
  readonly fromHook: boolean;
}

interface RecordedRun {
  readonly envelopes: Envelope[];
  readonly testCaseStartedId: string;
  readonly featureName: string;
  readonly featureUri: string;
  readonly scenarioName: string;
  readonly tagNames: string[];
  readonly stepTexts: string[];
  readonly stepMessages: string[];
  readonly attempt: number;
  readonly runStarted: Timestamp;
  readonly started: Timestamp;
  readonly finished: Timestamp;
}

function newTimestamp(): Timestamp {
  return { seconds: newCount(), nanos: newCount() };
}

function scenarioStep(status: TestStepResultStatus): RecordedStep {
  return { status, fromHook: false };
}

function hookStep(status: TestStepResultStatus): RecordedStep {
  return { status, fromHook: true };
}

function recordRun(steps: readonly RecordedStep[], ruleName: string | null): RecordedRun {
  const featureName = newText();
  const featureUri = `${newText()}.feature`;
  const scenarioName = newText();
  const scenarioId = newId();
  const pickleId = newId();
  const testCaseId = newId();
  const testCaseStartedId = newId();
  const tagNames = [`@${newText()}`, `@${newText()}`];
  const stepTexts = steps.map(() => newText());
  const stepMessages = steps.map(() => newText());
  const pickleStepIds = steps.map(() => newId());
  const testStepIds = steps.map(() => newId());
  const attempt = newCount();
  const runStarted = newTimestamp();
  const started = newTimestamp();
  const finished = newTimestamp();
  const scenario = { id: scenarioId, name: scenarioName };
  const children = ruleName === null ? [{ scenario }] : [{ rule: { name: ruleName, children: [{ scenario }] } }];
  const envelopes: Envelope[] = [
    { testRunStarted: { timestamp: runStarted } },
    { gherkinDocument: { uri: featureUri, feature: { name: featureName, children } } },
    {
      pickle: {
        id: pickleId,
        uri: featureUri,
        name: scenarioName,
        astNodeIds: [scenarioId],
        tags: tagNames.map((name) => ({ name })),
        steps: steps.flatMap((step, index) => (step.fromHook ? [] : [{ id: pickleStepIds[index], text: stepTexts[index] }])),
      },
    },
    {
      testCase: {
        id: testCaseId,
        pickleId,
        testSteps: steps.map((step, index) =>
          step.fromHook ? { id: testStepIds[index] } : { id: testStepIds[index], pickleStepId: pickleStepIds[index] },
        ),
      },
    },
    { testCaseStarted: { id: testCaseStartedId, testCaseId, attempt, timestamp: started } },
    ...steps.map((step, index) => ({
      testStepFinished: {
        testCaseStartedId,
        testStepId: testStepIds[index],
        testStepResult: { status: step.status, message: stepMessages[index] },
      },
    })),
    { testCaseFinished: { testCaseStartedId, timestamp: finished } },
  ];
  return {
    envelopes,
    testCaseStartedId,
    featureName,
    featureUri,
    scenarioName,
    tagNames,
    stepTexts,
    stepMessages,
    attempt,
    runStarted,
    started,
    finished,
  };
}

test('a passing scenario carries its feature, scenario, tags, attempt and times, and names no failed step', () => {
  const run = recordRun([scenarioStep(TestStepResultStatuses.passed), scenarioStep(TestStepResultStatuses.passed)], null);

  const [result] = toScenarioResults(run.envelopes);

  assert.deepEqual(result, {
    testCaseStartedId: run.testCaseStartedId,
    feature: run.featureName,
    featureUri: run.featureUri,
    rule: null,
    scenario: run.scenarioName,
    tags: run.tagNames,
    status: TestStepResultStatuses.passed,
    attempt: run.attempt,
    startedAt: toInstant(run.started),
    finishedAt: toInstant(run.finished),
    failedStep: null,
    errorMessage: null,
  });
});

test('a failed scenario names the first step that did not pass and carries its message', () => {
  const run = recordRun([scenarioStep(TestStepResultStatuses.passed), scenarioStep(TestStepResultStatuses.failed), scenarioStep(TestStepResultStatuses.skipped)], null);

  const [result] = toScenarioResults(run.envelopes);

  assert.equal(result.status, TestStepResultStatuses.failed);
  assert.equal(result.failedStep, run.stepTexts[1]);
  assert.equal(result.errorMessage, run.stepMessages[1]);
});

test('a scenario that did not fail but did not pass either still names its first unpassed step', () => {
  const run = recordRun([scenarioStep(TestStepResultStatuses.passed), scenarioStep(TestStepResultStatuses.pending), scenarioStep(TestStepResultStatuses.skipped)], null);

  const [result] = toScenarioResults(run.envelopes);

  assert.equal(result.status, TestStepResultStatuses.pending);
  assert.equal(result.failedStep, run.stepTexts[1]);
});

test('a failure in a hook fails the scenario with no step text to name, but keeps the hook message', () => {
  const run = recordRun([hookStep(TestStepResultStatuses.failed), scenarioStep(TestStepResultStatuses.skipped)], null);

  const [result] = toScenarioResults(run.envelopes);

  assert.equal(result.status, TestStepResultStatuses.failed);
  assert.equal(result.failedStep, null);
  assert.equal(result.errorMessage, run.stepMessages[0]);
});

test('a scenario inside a Rule carries the rule name', () => {
  const ruleName = newText();
  const run = recordRun([scenarioStep(TestStepResultStatuses.passed)], ruleName);

  const [result] = toScenarioResults(run.envelopes);

  assert.equal(result.rule, ruleName);
});

test('a finish with no matching start fails closed rather than dropping the scenario', () => {
  const run = recordRun([scenarioStep(TestStepResultStatuses.passed)], null);
  const withoutStart = run.envelopes.filter((envelope) => envelope.testCaseStarted === undefined);

  assert.throws(() => toScenarioResults(withoutStart), MalformedMessagesError);
});

test('the run starts when testRunStarted says it did', () => {
  const run = recordRun([scenarioStep(TestStepResultStatuses.passed)], null);

  assert.deepEqual(runStartedAt(run.envelopes), toInstant(run.runStarted));
});

test('messages with no testRunStarted fail closed rather than inventing a start time', () => {
  const run = recordRun([scenarioStep(TestStepResultStatuses.passed)], null);
  const withoutRunStart = run.envelopes.filter((envelope) => envelope.testRunStarted === undefined);

  assert.throws(() => runStartedAt(withoutRunStart), MalformedMessagesError);
});

test('the worst status wins in the Cucumber order', () => {
  const worstIndex = randomIntBetween(0, TEST_STEP_RESULT_STATUSES.length);
  const milderOrEqual = TEST_STEP_RESULT_STATUSES.slice(0, worstIndex + 1);
  const statuses = milderOrEqual.map(() => newMemberOf(milderOrEqual));

  assert.equal(worstStatus([...statuses, TEST_STEP_RESULT_STATUSES[worstIndex]]), TEST_STEP_RESULT_STATUSES[worstIndex]);
});

test('no steps at all is UNKNOWN', () => {
  assert.equal(worstStatus([]), TestStepResultStatuses.unknown);
});

test('seconds sent as a string read the same as seconds sent as a number', () => {
  const timestamp = newTimestamp();

  assert.deepEqual(toInstant({ ...timestamp, seconds: String(timestamp.seconds) }), toInstant(timestamp));
});

test('blank lines between envelopes are ignored', () => {
  const run = recordRun([scenarioStep(TestStepResultStatuses.passed)], null);
  const ndjson = run.envelopes.map((envelope) => `${JSON.stringify(envelope)}\n\n`).join('');

  assert.deepEqual(parseEnvelopes(ndjson), run.envelopes);
});
