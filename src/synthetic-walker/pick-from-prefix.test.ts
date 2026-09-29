import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Page } from '@playwright/test';
import { createRng, pickFromPrefix } from './index';
import { newText } from '../testing';

const SEED = 1;
const TILE_ID_PREFIX = `${newText()}-`;
const FIRST_TILE_ID = `${TILE_ID_PREFIX}0`;

type StubCall = () => Promise<unknown>;

interface StubbedPage {
  readonly page: Page;
  readonly calls: readonly StubCall[];
  readonly waitFor: StubCall;
  readonly count: StubCall;
}

function pageWhoseTilesArriveOnlyOnceWaitedFor(): StubbedPage {
  const calls: StubCall[] = [];
  let tileHasArrived = false;

  const waitFor = async (): Promise<void> => {
    calls.push(waitFor);
    tileHasArrived = true;
  };
  const count = async (): Promise<number> => {
    calls.push(count);
    return Number(tileHasArrived);
  };

  const locator = {
    first: () => ({ waitFor }),
    count,
    nth: (index: number) => ({ id: `${TILE_ID_PREFIX}${index}` }),
  };

  return {
    page: { locator: () => locator } as unknown as Page,
    calls,
    waitFor,
    count,
  };
}

test('a tile arriving after the walk has asked for one is waited for, not counted past', async () => {
  const { page, calls, waitFor, count } = pageWhoseTilesArriveOnlyOnceWaitedFor();

  const picked = (await pickFromPrefix(page, createRng(SEED), TILE_ID_PREFIX)) as unknown as {
    id: string;
  };

  assert.equal(picked.id, FIRST_TILE_ID);
  assert.equal(
    calls[0],
    waitFor,
    `pickFromPrefix counted before waiting, so the count describes a DOM that may still be filling: ${JSON.stringify(calls.map(call => call.name))}`,
  );
  assert.ok(calls.includes(count), 'pickFromPrefix never counted the tiles it picked from.');
});
