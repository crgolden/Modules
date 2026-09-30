import {
  TEST_STEP_RESULT_STATUSES,
  TestStepResultStatuses,
  type Envelope,
  type FeatureChild,
  type GherkinDocument,
  type Pickle,
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
}

interface ScenarioPlacement {
  readonly feature: string;
  readonly rule: string | null;
}

export class MalformedMessagesError extends Error {}

export function parseEnvelopes(ndjson: string): Envelope[] {
  return ndjson
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Envelope);
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

export function runStartedAt(envelopes: readonly Envelope[]): Date {
  const started = envelopes.find((envelope) => envelope.testRunStarted !== undefined)?.testRunStarted;
  if (started === undefined) {
    throw new MalformedMessagesError('No testRunStarted in the Cucumber messages, so the run has no start time.');
  }
  return toInstant(started.timestamp);
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
    };
  });
}
