import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startOnceRetryingFailures } from './index';
import { newCount, newText } from '../testing';

function startingInTurn<T>(outcomes: (() => Promise<T>)[]): () => Promise<T> {
  return () => {
    const outcome = outcomes.shift();
    if (outcome === undefined) {
      throw new Error('startApp started more often than the test allows');
    }
    return outcome();
  };
}

test('a started server is reused rather than started again', async () => {
  let starts = 0;
  const server = newText();
  const startApp = startOnceRetryingFailures(() => {
    starts += 1;
    return Promise.resolve(server);
  });

  const callers = Array.from({ length: newCount() }, () => startApp());

  assert.deepEqual(await Promise.all(callers), callers.map(() => server));
  assert.equal(starts, 1);
});

test('a failed start is forgotten so the next caller retries', async () => {
  const failure = new Error(newText());
  const server = newText();
  const startApp = startOnceRetryingFailures(
    startingInTurn<string>([() => Promise.reject(failure), () => Promise.resolve(server)]),
  );

  await assert.rejects(startApp(), failure);

  assert.equal(await startApp(), server);
});
