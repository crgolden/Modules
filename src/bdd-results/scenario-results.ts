import {
  TEST_STEP_RESULT_STATUSES,
  TestStepResultStatuses,
  type Duration,
  type Envelope,
  type FeatureChild,
  type GherkinDocument,
  type Pickle,
  type PickleStep,
  type PickleStepType,
  type Rule,
  type TestCase,
  type TestCaseFinished,
  type TestCaseStarted,
  type TestStepFinished,
  type TestStepResultStatus,
  type Timestamp,
} from './cucumber-messages';

const MILLISECONDS_PER_SECOND = 1000;
const NANOSECONDS_PER_MILLISECOND = 1_000_000;
const PASSED = TestStepResultStatuses.passed;

export interface StepResult {
  readonly position: number;
  readonly type: PickleStepType;
  readonly text: string;
  readonly status: TestStepResultStatus;
  readonly startedAt: Date;
  readonly finishedAt: Date;
  readonly errorMessage: string | null;
}

export interface ScenarioResult {
  readonly testCaseStartedId: string;
  readonly feature: string;
  readonly featureUri: string;
  readonly rule: string | null;
  readonly scenario: string;
  readonly tags: readonly string[];
  readonly status: TestStepResultStatus;
  readonly attempt: number;
  readonly startedAt: Date;
  readonly finishedAt: Date;
  readonly failedStep: string | null;
  readonly errorMessage: string | null;
  readonly steps: readonly StepResult[];
}

interface ScenarioPlacement {
  readonly feature: string;
  readonly rule: string | null;
}

export interface RunOutcome {
  readonly finishedAt: Date | null;
  readonly success: boolean;
  readonly errorMessage: string | null;
}

export const UNFINISHED_RUN: RunOutcome = { finishedAt: null, success: false, errorMessage: null };

const LINE_BREAK = '\n';

export class MalformedMessagesError extends Error {}

interface MessagesLine {
  readonly text: string;
  readonly number: number;
}

function parseLine(line: MessagesLine): Envelope {
  try {
    return JSON.parse(line.text) as Envelope;
  } catch (error) {
    throw new MalformedMessagesError(`Line ${line.number} of the Cucumber messages is not JSON: ${String(error)}`);
  }
}

function parseCutOffLine(line: MessagesLine): Envelope[] {
  try {
    return [JSON.parse(line.text) as Envelope];
  } catch (error) {
    if (error instanceof SyntaxError) {
      return [];
    }
    throw error;
  }
}

export function parseEnvelopes(ndjson: string): Envelope[] {
  const lines = ndjson
    .split(LINE_BREAK)
    .map((text, index) => ({ text, number: index + 1 }))
    .filter((line) => line.text.trim().length > 0);
  const last = lines.at(-1);
  if (last === undefined || ndjson.endsWith(LINE_BREAK)) {
    return lines.map(parseLine);
  }
  return [...lines.slice(0, -1).map(parseLine), ...parseCutOffLine(last)];
}

export function worstStatus(statuses: readonly TestStepResultStatus[]): TestStepResultStatus {
  return statuses.reduce<TestStepResultStatus>(
    (worst, status) =>
      TEST_STEP_RESULT_STATUSES.indexOf(status) > TEST_STEP_RESULT_STATUSES.indexOf(worst) ? status : worst,
    TestStepResultStatuses.unknown,
  );
}

export function toInstant(timestamp: Timestamp): Date {
  return new Date(Number(timestamp.seconds) * MILLISECONDS_PER_SECOND + timestamp.nanos / NANOSECONDS_PER_MILLISECOND);
}

export function toMilliseconds(duration: Duration): number {
  return Number(duration.seconds) * MILLISECONDS_PER_SECOND + duration.nanos / NANOSECONDS_PER_MILLISECOND;
}

function required<T>(items: ReadonlyMap<string, T>, id: string, kind: string): T {
  const item = items.get(id);
  if (item === undefined) {
    throw new MalformedMessagesError(`No ${kind} with id ${id} in the Cucumber messages.`);
  }
  return item;
}

function indexById<T>(items: readonly T[], idOf: (item: T) => string): Map<string, T> {
  return new Map(items.map((item) => [idOf(item), item]));
}

function rulePlacements(feature: string, rule: Rule): [string, ScenarioPlacement][] {
  return rule.children.flatMap((ruleChild): [string, ScenarioPlacement][] =>
    ruleChild.scenario === undefined ? [] : [[ruleChild.scenario.id, { feature, rule: rule.name }]],
  );
}

function childPlacements(feature: string, child: FeatureChild): [string, ScenarioPlacement][] {
  const direct: [string, ScenarioPlacement][] =
    child.scenario === undefined ? [] : [[child.scenario.id, { feature, rule: null }]];
  return child.rule === undefined ? direct : [...direct, ...rulePlacements(feature, child.rule)];
}

function placementsOf(documents: readonly GherkinDocument[]): Map<string, ScenarioPlacement> {
  return new Map(
    documents.flatMap((document) => {
      const feature = document.feature;
      return feature === undefined ? [] : feature.children.flatMap((child) => childPlacements(feature.name, child));
    }),
  );
}

interface UnpassedStep {
  readonly text: string | null;
  readonly message: string | null;
}

function nonBlankOrNull(value: string | undefined): string | null {
  return value !== undefined && value.trim().length > 0 ? value : null;
}

function firstUnpassedStep(
  testCase: TestCase,
  pickle: Pickle,
  finishedSteps: readonly TestStepFinished[],
): UnpassedStep | null {
  const resultByStep = new Map(finishedSteps.map((step) => [step.testStepId, step.testStepResult]));
  const unpassed = testCase.testSteps.find((step) => resultByStep.get(step.id)?.status !== PASSED);
  if (unpassed === undefined) {
    return null;
  }
  const pickleStep = pickle.steps.find((step) => step.id === unpassed.pickleStepId);
  return {
    text: nonBlankOrNull(pickleStep?.text),
    message: nonBlankOrNull(resultByStep.get(unpassed.id)?.message),
  };
}

function typeOf(pickleStep: PickleStep): PickleStepType {
  if (pickleStep.type === undefined) {
    throw new MalformedMessagesError(`Pickle step ${pickleStep.id} has no type, so it cannot be placed as a Given, When or Then.`);
  }
  return pickleStep.type;
}

function stepResultsOf(
  testCase: TestCase,
  pickle: Pickle,
  finishedSteps: readonly TestStepFinished[],
): StepResult[] {
  const pickleSteps = indexById(pickle.steps, (step) => step.id);
  const finishedById = indexById(finishedSteps, (step) => step.testStepId);
  return testCase.testSteps
    .flatMap((testStep) => (testStep.pickleStepId === undefined ? [] : [{ testStep, pickleStepId: testStep.pickleStepId }]))
    .map(({ testStep, pickleStepId }, index) => {
      const pickleStep = required(pickleSteps, pickleStepId, 'pickle step');
      const finished = required(finishedById, testStep.id, 'testStepFinished');
      const finishedAt = toInstant(finished.timestamp);
      const result = finished.testStepResult;
      return {
        position: index + 1,
        type: typeOf(pickleStep),
        text: pickleStep.text,
        status: result.status,
        startedAt: new Date(finishedAt.getTime() - toMilliseconds(result.duration)),
        finishedAt,
        errorMessage:
          result.status === PASSED ? null : (nonBlankOrNull(result.exception?.message) ?? nonBlankOrNull(result.message)),
      };
    });
}

export function runStartedAt(envelopes: readonly Envelope[]): Date {
  const started = envelopes.find((envelope) => envelope.testRunStarted !== undefined)?.testRunStarted;
  if (started === undefined) {
    throw new MalformedMessagesError('No testRunStarted in the Cucumber messages, so the run has no start time.');
  }
  return toInstant(started.timestamp);
}

export function runOutcome(envelopes: readonly Envelope[]): RunOutcome {
  const finished = envelopes.find((envelope) => envelope.testRunFinished !== undefined)?.testRunFinished;
  if (finished === undefined) {
    return UNFINISHED_RUN;
  }
  return {
    finishedAt: toInstant(finished.timestamp),
    success: finished.success,
    errorMessage: nonBlankOrNull(finished.exception?.message) ?? nonBlankOrNull(finished.message),
  };
}

export function toScenarioResults(envelopes: readonly Envelope[]): ScenarioResult[] {
  const pickles = indexById(
    envelopes.flatMap((envelope) => (envelope.pickle === undefined ? [] : [envelope.pickle])),
    (pickle) => pickle.id,
  );
  const testCases = indexById(
    envelopes.flatMap((envelope) => (envelope.testCase === undefined ? [] : [envelope.testCase])),
    (testCase) => testCase.id,
  );
  const starts = indexById(
    envelopes.flatMap((envelope) => (envelope.testCaseStarted === undefined ? [] : [envelope.testCaseStarted])),
    (started: TestCaseStarted) => started.id,
  );
  const stepsByStart = new Map<string, TestStepFinished[]>();
  for (const envelope of envelopes) {
    const step = envelope.testStepFinished;
    if (step !== undefined) {
      stepsByStart.set(step.testCaseStartedId, [...(stepsByStart.get(step.testCaseStartedId) ?? []), step]);
    }
  }
  const placements = placementsOf(
    envelopes.flatMap((envelope) => (envelope.gherkinDocument === undefined ? [] : [envelope.gherkinDocument])),
  );
  const finishes = envelopes.flatMap((envelope) =>
    envelope.testCaseFinished === undefined ? [] : [envelope.testCaseFinished],
  );

  return finishes.map((finished: TestCaseFinished) => {
    const started = required(starts, finished.testCaseStartedId, 'testCaseStarted');
    const testCase = required(testCases, started.testCaseId, 'testCase');
    const pickle = required(pickles, testCase.pickleId, 'pickle');
    const placement = required(placements, pickle.astNodeIds[0], 'scenario');
    const finishedSteps = stepsByStart.get(started.id) ?? [];
    const status = worstStatus(finishedSteps.map((step) => step.testStepResult.status));
    const unpassed = status === PASSED ? null : firstUnpassedStep(testCase, pickle, finishedSteps);
    return {
      testCaseStartedId: started.id,
      feature: placement.feature,
      featureUri: pickle.uri,
      rule: placement.rule,
      scenario: pickle.name,
      tags: pickle.tags.map((tag) => tag.name),
      status,
      attempt: started.attempt,
      startedAt: toInstant(started.timestamp),
      finishedAt: toInstant(finished.timestamp),
      failedStep: unpassed?.text ?? null,
      errorMessage: unpassed?.message ?? null,
      steps: stepResultsOf(testCase, pickle, finishedSteps),
    };
  });
}
