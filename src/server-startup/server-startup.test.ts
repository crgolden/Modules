import assert from 'node:assert/strict';
import { startOnceRetryingFailures } from './index';
import { newCount, newText } from '../testing';

async function aStartedServerIsReusedRatherThanStartedAgain(): Promise<void> {
  let starts = 0;
  const server = newText();
  const startApp = startOnceRetryingFailures(() => {
    starts += 1;
    return Promise.resolve(server);
  });

  const callers = Array.from({ length: newCount() }, () => startApp());

  assert.deepEqual(await Promise.all(callers), callers.map(() => server));
  assert.equal(starts, 1);
}

async function aFailedStartIsForgottenSoTheNextCallerRetries(): Promise<void> {
  const failure = new Error(newText());
  const server = newText();
  const outcomes = [() => Promise.reject(failure), () => Promise.resolve(server)];
  const startApp = startOnceRetryingFailures(() => {
    const outcome = outcomes.shift();
    if (outcome === undefined) {
      throw new Error('startApp started more often than the test allows');
    }
    return outcome();
  });

  await assert.rejects(startApp(), failure);

  assert.equal(await startApp(), server);
}

aStartedServerIsReusedRatherThanStartedAgain()
  .then(aFailedStartIsForgottenSoTheNextCallerRetries)
  .then(() => {
    console.log('server-startup: one start is shared, and a failed start is retried by the next caller');
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
