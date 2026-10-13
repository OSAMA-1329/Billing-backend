import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { getSalesRetentionCutoff } from './salesRetentionService.js';

describe('sales retention cutoff', () => {
  test('uses one calendar year and preserves UTC time', () => {
    const now = new Date('2026-10-13T18:42:17.123Z');
    assert.equal(getSalesRetentionCutoff(now, 12).toISOString(), '2025-10-13T18:42:17.123Z');
  });

  test('clamps to the final day of the target month', () => {
    const now = new Date('2026-10-31T00:00:00.000Z');
    assert.equal(getSalesRetentionCutoff(now, 1).toISOString(), '2026-09-30T00:00:00.000Z');
  });

  test('rejects invalid dates and retention periods', () => {
    assert.throws(() => getSalesRetentionCutoff(new Date(Number.NaN), 10), /valid current date/);
    assert.throws(() => getSalesRetentionCutoff(new Date(), 0), /positive integer/);
  });
});