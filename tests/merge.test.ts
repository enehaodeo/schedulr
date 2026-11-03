import { describe, expect, it } from 'vitest';
import { shouldTakeRemote } from '../src/sync/merge';

describe('shouldTakeRemote', () => {
  it('takes remote when no local copy', () => {
    expect(shouldTakeRemote(undefined, { updated_at: 1 })).toBe(true);
  });
  it('takes remote when local is clean', () => {
    expect(shouldTakeRemote({ updated_at: 5, dirty: 0 }, { updated_at: 1 })).toBe(true);
  });
  it('keeps newer dirty local', () => {
    expect(shouldTakeRemote({ updated_at: 5, dirty: 1 }, { updated_at: 1 })).toBe(false);
  });
  it('takes newer remote over dirty local', () => {
    expect(shouldTakeRemote({ updated_at: 5, dirty: 1 }, { updated_at: 9 })).toBe(true);
  });
});
