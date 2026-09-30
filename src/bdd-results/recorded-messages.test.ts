import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { TestStepResultStatuses, parseEnvelopes, runStartedAt, toScenarioResults } from './index';
import { MESSAGES_ENCODING } from './cli';
import { RECORDED_REQNROLL_RUN_FROM_COMPILED_TEST } from './recorded/recorded-run-constants';

const envelopes = parseEnvelopes(readFileSync(join(__dirname, ...RECORDED_REQNROLL_RUN_FROM_COMPILED_TEST), MESSAGES_ENCODING));
const features = envelopes.flatMap((envelope) => (envelope.gherkinDocument?.feature === undefined ? [] : [envelope.gherkinDocument.feature]));
const pickles = envelopes.flatMap((envelope) => (envelope.pickle === undefined ? [] : [envelope.pickle]));
const finishes = envelopes.flatMap((envelope) => (envelope.testCaseFinished === undefined ? [] : [envelope.testCaseFinished]));
const tagNamesByScenario = new Map(pickles.map((pickle) => [pickle.name, pickle.tags.map((tag) => tag.name)]));

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
