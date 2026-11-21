import { describe, expect, it } from 'vitest';
import type { RecurringTask, ShortTask } from '../src/db/types';
import {
  HORIZON_DAYS,
  occurrenceDates,
  occurrenceId,
  planRecurring,
  ruleError,
} from '../src/features/recurring/plan';
import { dateMinToMs } from '../src/lib/dates';

// 2026-11-16 是周一
const MON = '2026-11-16';

function rule(over: Partial<RecurringTask> = {}): RecurringTask {
  return {
    id: 'r1',
    user_id: null,
    updated_at: 100,
    deleted: false,
    dirty: 0,
    title: '物理课',
    tags: [],
    weekdays: [1, 3],
    start_min: 8 * 60,
    end_min: 9 * 60,
    start_date: MON,
    end_date: null,
    ...over,
  };
}

function task(over: Partial<ShortTask> = {}): ShortTask {
  return {
    id: 't1',
    user_id: null,
    updated_at: 1,
    deleted: false,
    dirty: 0,
    title: '作业',
    duration_min: 60,
    tags: [],
    parent_id: null,
    sort_order: 1,
    status: 'scheduled',
    start_at: null,
    end_at: null,
    source_public_id: null,
    recurring_id: null,
    ...over,
  };
}

describe('occurrenceDates', () => {
  it('picks the chosen weekdays within the range', () => {
    expect(occurrenceDates(rule(), MON, '2026-11-25')).toEqual(['2026-11-16', '2026-11-18', '2026-11-23', '2026-11-25']);
  });
  it('clips to start and end dates', () => {
    expect(occurrenceDates(rule({ start_date: '2026-11-17', end_date: '2026-11-23' }), MON, '2026-11-30')).toEqual([
      '2026-11-18',
      '2026-11-23',
    ]);
  });
});

describe('occurrenceId', () => {
  it('is a stable uuid that changes with rule version and date', () => {
    const a = occurrenceId('r1', 100, MON);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(occurrenceId('r1', 100, MON)).toBe(a);
    expect(occurrenceId('r1', 101, MON)).not.toBe(a);
    expect(occurrenceId('r1', 100, '2026-11-18')).not.toBe(a);
  });
});

describe('ruleError', () => {
  it('mirrors the database checks', () => {
    expect(ruleError(rule())).toBeNull();
    expect(ruleError(rule({ weekdays: [] }))).not.toBeNull();
    expect(ruleError(rule({ end_min: 8 * 60 }))).not.toBeNull();
    expect(ruleError(rule({ end_date: '2026-11-01' }))).not.toBeNull();
  });
});

describe('planRecurring', () => {
  const now = dateMinToMs(MON, 7 * 60);

  it('adds future occurrences within the horizon', () => {
    const plan = planRecurring([rule()], [], now);
    expect(plan.add).toHaveLength(4); // 两周里的周一、周三
    expect(plan.add[0].start).toBe(dateMinToMs(MON, 8 * 60));
    expect(plan.add.every((o) => o.end - o.start === 60 * 60 * 1000)).toBe(true);
    expect(plan.conflicts).toEqual([]);
    expect(HORIZON_DAYS).toBe(14);
  });

  it('skips occurrences that already started', () => {
    const plan = planRecurring([rule()], [], dateMinToMs(MON, 8 * 60));
    expect(plan.add.map((o) => o.date)).not.toContain(MON);
  });

  it('never regenerates an occurrence that exists, even deleted or in the pool', () => {
    const id = occurrenceId('r1', 100, MON);
    const id2 = occurrenceId('r1', 100, '2026-11-18');
    const tasks = [
      task({ id, recurring_id: 'r1', deleted: true }),
      task({ id: id2, recurring_id: 'r1', status: 'pool' }),
    ];
    const plan = planRecurring([rule()], tasks, now);
    expect(plan.add.map((o) => o.id)).not.toContain(id);
    expect(plan.add.map((o) => o.id)).not.toContain(id2);
  });

  it('reports clashes with scheduled tasks instead of adding', () => {
    const busy = task({ start_at: dateMinToMs(MON, 8 * 60 + 30), end_at: dateMinToMs(MON, 10 * 60) });
    const plan = planRecurring([rule()], [busy], now);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0].occ.date).toBe(MON);
    expect(plan.conflicts[0].clashes).toEqual(['t1']);
    expect(plan.add).toHaveLength(3);
  });

  it('ignores touching but not overlapping tasks', () => {
    const busy = task({ start_at: dateMinToMs(MON, 9 * 60), end_at: dateMinToMs(MON, 10 * 60) });
    expect(planRecurring([rule()], [busy], now).conflicts).toEqual([]);
  });

  it('detects clashes between two rules', () => {
    const plan = planRecurring([rule(), rule({ id: 'r2', weekdays: [1], start_min: 8 * 60 + 30, end_min: 9 * 60 + 30 })], [], now);
    expect(plan.conflicts.length).toBe(2);
    expect(plan.conflicts.every((c) => c.occ.rule.id === 'r2')).toBe(true);
  });

  it('removes future unmodified instances of an edited or deleted rule', () => {
    const old = task({
      id: 'old',
      recurring_id: 'r1',
      updated_at: 100,
      start_at: dateMinToMs(MON, 8 * 60),
      end_at: dateMinToMs(MON, 9 * 60),
    });
    const past = { ...old, id: 'past', start_at: now - 60_000 };
    const touched = { ...old, id: 'touched', updated_at: 300 };
    const edited = rule({ updated_at: 200, start_min: 10 * 60, end_min: 11 * 60 });
    const plan = planRecurring([edited], [old, past, touched], now);
    expect(plan.remove).toEqual(['old']);
    // 旧实例被移除，新时间的实例照常排入，不会和旧实例冲突
    expect(plan.add[0].start).toBe(dateMinToMs(MON, 10 * 60));

    const gone = planRecurring([rule({ updated_at: 200, deleted: true })], [old], now);
    expect(gone.remove).toEqual(['old']);
    expect(gone.add).toEqual([]);
  });
});
