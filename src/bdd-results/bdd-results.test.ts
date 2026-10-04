import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MalformedMessagesError,
  PickleStepTypes,
  TEST_STEP_RESULT_STATUSES,
  TestStepResultStatuses,
  UNFINISHED_RUN,
  parseEnvelopes,
  runOutcome,
  runStartedAt,
  toInstant,
  toMilliseconds,
  toScenarioResults,
  worstStatus,
  type Duration,
  type Envelope,
  type PickleStepType,
  type StepResult,
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
  readonly steps: readonly RecordedStep[];
  readonly stepTexts: string[];
  readonly stepMessages: string[];
  readonly stepExceptionMessages: string[];
  readonly stepTypes: PickleStepType[];
  readonly stepDurations: Duration[];
  readonly stepFinishes: Timestamp[];
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
  const stepExceptionMessages = steps.map(() => newText());
  const stepTypes = steps.map(() => newMemberOf(Object.values(PickleStepTypes)));
  const stepDurations = steps.map(() => newTimestamp());
  const stepFinishes = steps.map(() => newTimestamp());
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
        steps: steps.flatMap((step, index) =>
          step.fromHook ? [] : [{ id: pickleStepIds[index], text: stepTexts[index], type: stepTypes[index] }],
        ),
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
        testStepResult: {
          status: step.status,
          duration: stepDurations[index],
          message: stepMessages[index],
          exception: { type: newText(), message: stepExceptionMessages[index] },
        },
        timestamp: stepFinishes[index],
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
    steps,
    stepTexts,
    stepMessages,
    stepExceptionMessages,
    stepTypes,
    stepDurations,
    stepFinishes,
    attempt,
    runStarted,
    started,
    finished,
  };
}

function startedBefore(finished: Timestamp, duration: Duration): Date {
  return new Date(toInstant(finished).getTime() - toMilliseconds(duration));
}

function passedStepsOf(run: RecordedRun): StepResult[] {
  return run.stepTexts.map((text, index) => ({
    position: index + 1,
    type: run.stepTypes[index],
    text,
    status: TestStepResultStatuses.passed,
    startedAt: startedBefore(run.stepFinishes[index], run.stepDurations[index]),
    finishedAt: toInstant(run.stepFinishes[index]),
    errorMessage: null,
  }));
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
    steps: passedStepsOf(run),
  });
});

test('every scenario step is recorded in order with its Given, When or Then type, its text, its status and its times', () => {
  const run = recordRun([scenarioStep(TestStepResultStatuses.passed), scenarioStep(TestStepResultStatuses.passed), scenarioStep(TestStepResultStatuses.passed)], null);

  const [result] = toScenarioResults(run.envelopes);

  assert.deepEqual(result.steps, passedStepsOf(run));
});

test('a hook is not a step of the journey, so steps are numbered among the scenario steps alone', () => {
  const run = recordRun([hookStep(TestStepResultStatuses.passed), scenarioStep(TestStepResultStatuses.passed), scenarioStep(TestStepResultStatuses.passed)], null);

  const [result] = toScenarioResults(run.envelopes);

  assert.deepEqual(
    result.steps.map((step) => step.text),
    run.stepTexts.slice(1),
  );
  assert.deepEqual(
    result.steps.map((step) => step.position),
    result.steps.map((_, index) => index + 1),
  );
});

test('a step that did not pass carries the exception message rather than the stack-bearing result message', () => {
  const run = recordRun([scenarioStep(TestStepResultStatuses.passed), scenarioStep(TestStepResultStatuses.failed), scenarioStep(TestStepResultStatuses.skipped)], null);

  const [result] = toScenarioResults(run.envelopes);

  assert.deepEqual(
    result.steps.map((step) => step.errorMessage),
    [null, ...run.stepExceptionMessages.slice(1)],
  );
});

function withoutExceptions(envelopes: readonly Envelope[]): Envelope[] {
  return envelopes.map((envelope) =>
    envelope.testStepFinished === undefined
      ? envelope
      : {
          testStepFinished: {
            ...envelope.testStepFinished,
            testStepResult: { ...envelope.testStepFinished.testStepResult, exception: undefined },
          },
        },
  );
}

test('a step that did not pass and has no exception falls back to the result message', () => {
  const run = recordRun([scenarioStep(TestStepResultStatuses.failed)], null);

  const [result] = toScenarioResults(withoutExceptions(run.envelopes));

  assert.equal(result.steps[0].errorMessage, run.stepMessages[0]);
});

function withoutStepTypes(envelopes: readonly Envelope[]): Envelope[] {
  return envelopes.map((envelope) =>
    envelope.pickle === undefined
      ? envelope
      : { pickle: { ...envelope.pickle, steps: envelope.pickle.steps.map((step) => ({ id: step.id, text: step.text })) } },
  );
}

test('a pickle step with no type fails closed rather than guessing whether it is a Given, When or Then', () => {
  const run = recordRun([scenarioStep(TestStepResultStatuses.passed)], null);

  assert.throws(() => toScenarioResults(withoutStepTypes(run.envelopes)), MalformedMessagesError);
});

test('a finished scenario with a step that never finished fails closed rather than dropping the step', () => {
  const run = recordRun([scenarioStep(TestStepResultStatuses.passed), scenarioStep(TestStepResultStatuses.passed)], null);
  const firstStepFinish = run.envelopes.find((envelope) => envelope.testStepFinished !== undefined);
  const envelopes = run.envelopes.filter((envelope) => envelope !== firstStepFinish);

  assert.throws(() => toScenarioResults(envelopes), MalformedMessagesError);
});

test('a duration reads as the same instant offset as a timestamp of the same seconds and nanos', () => {
  const duration = newTimestamp();

  assert.deepEqual(new Date(toMilliseconds(duration)), toInstant(duration));
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

function cutOff(envelope: Envelope): string {
  const text = JSON.stringify(envelope);
  return text.slice(0, randomIntBetween(1, text.length - 1));
}

function linesOf(envelopes: readonly Envelope[]): string {
  return envelopes.map((envelope) => `${JSON.stringify(envelope)}\n`).join('');
}

test('a final line cut off mid-write, with no line break after it, is dropped and the lines before it kept', () => {
  const run = recordRun([scenarioStep(TestStepResultStatuses.passed)], null);
  const kept = run.envelopes.slice(0, -1);
  const cut = run.envelopes[kept.length];

  assert.deepEqual(parseEnvelopes(`${linesOf(kept)}${cutOff(cut)}`), kept);
});

test('a final line with no line break after it is kept when it is whole', () => {
  const run = recordRun([scenarioStep(TestStepResultStatuses.passed)], null);

  assert.deepEqual(parseEnvelopes(linesOf(run.envelopes).trimEnd()), run.envelopes);
});

test('a line that is not JSON before the last one is corruption, not a cut, and fails closed', () => {
  const run = recordRun([scenarioStep(TestStepResultStatuses.passed)], null);
  const [first, ...rest] = run.envelopes;

  assert.throws(() => parseEnvelopes(`${cutOff(first)}\n${linesOf(rest)}`), MalformedMessagesError);
});

test('a final line that is not JSON but ends in a line break was written whole, so it fails closed', () => {
  const run = recordRun([scenarioStep(TestStepResultStatuses.passed)], null);
  const kept = run.envelopes.slice(0, -1);
  const cut = run.envelopes[kept.length];

  assert.throws(() => parseEnvelopes(`${linesOf(kept)}${cutOff(cut)}\n`), MalformedMessagesError);
});

test('a run that finished carries its finish time, its success and the exception message', () => {
  const run = recordRun([scenarioStep(TestStepResultStatuses.passed)], null);
  const finished = newTimestamp();
  const exceptionMessage = newText();

  const outcome = runOutcome([
    ...run.envelopes,
    { testRunFinished: { success: false, timestamp: finished, exception: { type: newText(), message: exceptionMessage } } },
  ]);

  assert.deepEqual(outcome, { finishedAt: toInstant(finished), success: false, errorMessage: exceptionMessage });
});

test('a run that finished with no exception falls back to the testRunFinished message', () => {
  const message = newText();

  const outcome = runOutcome([{ testRunFinished: { success: false, timestamp: newTimestamp(), message } }]);

  assert.equal(outcome.errorMessage, message);
});

test('a run that succeeded with nothing to say carries no error message', () => {
  const outcome = runOutcome([{ testRunFinished: { success: true, timestamp: newTimestamp() } }]);

  assert.equal(outcome.success, true);
  assert.equal(outcome.errorMessage, null);
});

test('messages with no testRunFinished describe a run that did not finish, whatever its scenarios did', () => {
  const run = recordRun([scenarioStep(TestStepResultStatuses.passed)], null);

  assert.deepEqual(runOutcome(run.envelopes), UNFINISHED_RUN);
});
