export const TestStepResultStatuses = {
  unknown: 'UNKNOWN',
  passed: 'PASSED',
  skipped: 'SKIPPED',
  pending: 'PENDING',
  undefined: 'UNDEFINED',
  ambiguous: 'AMBIGUOUS',
  failed: 'FAILED',
} as const;

export type TestStepResultStatus = (typeof TestStepResultStatuses)[keyof typeof TestStepResultStatuses];

export const TEST_STEP_RESULT_STATUSES: readonly TestStepResultStatus[] = [
  TestStepResultStatuses.unknown,
  TestStepResultStatuses.passed,
  TestStepResultStatuses.skipped,
  TestStepResultStatuses.pending,
  TestStepResultStatuses.undefined,
  TestStepResultStatuses.ambiguous,
  TestStepResultStatuses.failed,
];

export interface Timestamp {
  readonly seconds: number | string;
  readonly nanos: number;
}

export interface Tag {
  readonly name: string;
}

export interface Scenario {
  readonly id: string;
  readonly name: string;
}

export interface RuleChild {
  readonly scenario?: Scenario;
}

export interface Rule {
  readonly name: string;
  readonly children: readonly RuleChild[];
}

export interface FeatureChild {
  readonly rule?: Rule;
  readonly scenario?: Scenario;
}

export interface Feature {
  readonly name: string;
  readonly children: readonly FeatureChild[];
}

export interface GherkinDocument {
  readonly uri?: string;
  readonly feature?: Feature;
}

export interface PickleStep {
  readonly id: string;
  readonly text: string;
}

export interface Pickle {
  readonly id: string;
  readonly uri: string;
  readonly name: string;
  readonly astNodeIds: readonly string[];
  readonly tags: readonly Tag[];
  readonly steps: readonly PickleStep[];
}

export interface TestStep {
  readonly id: string;
  readonly pickleStepId?: string;
}

export interface TestCase {
  readonly id: string;
  readonly pickleId: string;
  readonly testSteps: readonly TestStep[];
}

export interface TestCaseStarted {
  readonly id: string;
  readonly testCaseId: string;
  readonly attempt: number;
  readonly timestamp: Timestamp;
}

export interface TestStepResult {
  readonly status: TestStepResultStatus;
  readonly message?: string;
}

export interface TestRunStarted {
  readonly timestamp: Timestamp;
}

export interface Exception {
  readonly type: string;
  readonly message?: string;
}

export interface TestRunFinished {
  readonly success: boolean;
  readonly timestamp: Timestamp;
  readonly message?: string;
  readonly exception?: Exception;
}

export interface TestStepFinished {
  readonly testCaseStartedId: string;
  readonly testStepId: string;
  readonly testStepResult: TestStepResult;
}

export interface TestCaseFinished {
  readonly testCaseStartedId: string;
  readonly timestamp: Timestamp;
}

export interface Envelope {
  readonly testRunStarted?: TestRunStarted;
  readonly gherkinDocument?: GherkinDocument;
  readonly pickle?: Pickle;
  readonly testCase?: TestCase;
  readonly testCaseStarted?: TestCaseStarted;
  readonly testStepFinished?: TestStepFinished;
  readonly testCaseFinished?: TestCaseFinished;
  readonly testRunFinished?: TestRunFinished;
}
