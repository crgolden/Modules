import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EOL } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  MalformedMessagesError,
  TestStepResultStatuses,
  UNFINISHED_RUN,
  parseEnvelopes,
  runOutcome,
  runStartedAt,
  toInstant,
  toScenarioResults,
  type Envelope,
} from './index';
import { MESSAGES_ENCODING } from './cli';
import {
  RECORDED_KILLED_REQNROLL_RUN_FROM_COMPILED_TEST,
  RECORDED_REQNROLL_RUN_FROM_COMPILED_TEST,
} from './recorded/recorded-run-constants';

function readRecorded(pathFromCompiledTest: readonly string[]): string {
  return readFileSync(join(__dirname, ...pathFromCompiledTest), MESSAGES_ENCODING);
}

function finishesOf(recorded: readonly Envelope[]): unknown[] {
  return recorded.flatMap((envelope) => (envelope.testCaseFinished === undefined ? [] : [envelope.testCaseFinished]));
}

const envelopes = parseEnvelopes(readRecorded(RECORDED_REQNROLL_RUN_FROM_COMPILED_TEST));
const features = envelopes.flatMap((envelope) => (envelope.gherkinDocument?.feature === undefined ? [] : [envelope.gherkinDocument.feature]));
const pickles = envelopes.flatMap((envelope) => (envelope.pickle === undefined ? [] : [envelope.pickle]));
const finishes = finishesOf(envelopes);
const runFinishes = envelopes.flatMap((envelope) => (envelope.testRunFinished === undefined ? [] : [envelope.testRunFinished]));
const tagNamesByScenario = new Map(pickles.map((pickle) => [pickle.name, pickle.tags.map((tag) => tag.name)]));
const killedMessages = readRecorded(RECORDED_KILLED_REQNROLL_RUN_FROM_COMPILED_TEST);
const killedEnvelopes = parseEnvelopes(killedMessages);

test('a recorded Reqnroll run yields one result per finished scenario, each placed in its feature', () => {
  const results = toScenarioResults(envelopes);

  assert.equal(results.length, finishes.length);
  assert.deepEqual(new Set(results.map((result) => result.feature)), new Set(features.map((feature) => feature.name)));
  assert.deepEqual(new Set(results.map((result) => result.scenario)), new Set(pickles.map((pickle) => pickle.name)));
});

test('a recorded Reqnroll run that passed reports every scenario passed with no failed step', () => {
  const results = toScenarioResults(envelopes);

  assert.deepEqual(new Set(results.map((result) => result.status)), new Set([TestStepResultStatuses.passed]));
  assert.deepEqual(new Set(results.map((result) => result.failedStep)), new Set([null]));
});

test('a recorded Reqnroll run carries the tags its feature declares on every scenario', () => {
  const results = toScenarioResults(envelopes);

  assert.deepEqual(
    results.map((result) => result.tags),
    results.map((result) => tagNamesByScenario.get(result.scenario)),
  );
});

test('a recorded Reqnroll run has a start time before any of its scenarios began', () => {
  const started = runStartedAt(envelopes);
  const results = toScenarioResults(envelopes);

  assert.equal(results.every((result) => result.startedAt >= started), true);
});

test('a recorded Reqnroll run records every pickle step of every scenario with the type and text its pickle gives', () => {
  const recorded = toScenarioResults(envelopes).flatMap((result) => result.steps.map((step) => `${step.type} ${step.text}`));
  const declared = pickles.flatMap((pickle) => pickle.steps.map((step) => `${step.type} ${step.text}`));

  assert.equal(recorded.length, declared.length);
  assert.deepEqual(new Set(recorded), new Set(declared));
});

test('a recorded Reqnroll run that passed reports every step passed, with no error and a start no later than its finish', () => {
  const steps = toScenarioResults(envelopes).flatMap((result) => result.steps);

  assert.deepEqual(new Set(steps.map((step) => step.status)), new Set([TestStepResultStatuses.passed]));
  assert.deepEqual(new Set(steps.map((step) => step.errorMessage)), new Set([null]));
  assert.equal(steps.every((step) => step.startedAt <= step.finishedAt), true);
});

test('a recorded Reqnroll run that passed finished successfully at the time testRunFinished gives', () => {
  assert.deepEqual(runOutcome(envelopes), {
    finishedAt: toInstant(runFinishes[0].timestamp),
    success: true,
    errorMessage: null,
  });
});

test('a recorded Reqnroll run killed mid-write ends on a cut-off line, which a line break after it would make corrupt', () => {
  assert.throws(() => parseEnvelopes(`${killedMessages}${EOL}`), MalformedMessagesError);
});

test('a recorded Reqnroll run killed mid-write yields every scenario it finished', () => {
  const results = toScenarioResults(killedEnvelopes);

  assert.equal(results.length, finishesOf(killedEnvelopes).length);
  assert.notEqual(results.length, 0);
});

test('a recorded Reqnroll run killed mid-write reads as a run that did not finish', () => {
  assert.deepEqual(runOutcome(killedEnvelopes), UNFINISHED_RUN);
});
