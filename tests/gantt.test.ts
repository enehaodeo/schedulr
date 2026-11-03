import { describe, expect, it } from 'vitest';
import { endDate, fitsDeadline, isLongExpired, latestStart } from '../src/features/longTasks/gantt';
import type { LongTask } from '../src/db/types';

describe('gantt constraints', () => {
  it('computes inclusive end date', () => {
    expect(endDate('2026-11-03', 3)).toBe('2026-11-05');
  });
  it('allows ending exactly on deadline', () => {
    expect(fitsDeadline('2026-11-03', 3, '2026-11-05')).toBe(true);
  });
  it('rejects ending after deadline', () => {
    expect(fitsDeadline('2026-11-04', 3, '2026-11-05')).toBe(false);
  });
  it('computes latest start', () => {
    expect(latestStart(3, '2026-11-05')).toBe('2026-11-03');
  });
  it('detects expiry after the end day passes', () => {
    const t = { status: 'scheduled', start_date: '2026-11-01', duration_days: 2 } as LongTask;
    expect(isLongExpired(t, '2026-11-02')).toBe(false);
    expect(isLongExpired(t, '2026-11-03')).toBe(true);
  });
});
