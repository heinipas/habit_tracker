import './setup';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/db';
import { clearAllData, saveHabit, upsertHabitLog } from '../db/queries';
import { getUnsyncedSummary } from '../sync/unsynced';

describe('Unsynced changes summary', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('counts unsynced rows across all four tables and groups logs per habit', async () => {
    const beer = await saveHabit({
      name: 'Beer',
      data_type: 'float',
      unit: 'units',
      is_good: false,
      default_value: 0,
      widget_type: 'preset_accumulator',
      config_json: '{}'
    });
    const running = await saveHabit({
      name: 'Running',
      data_type: 'float',
      unit: 'km',
      is_good: true,
      default_value: 0,
      widget_type: 'counter',
      config_json: '{}'
    });

    await upsertHabitLog(beer.id, '2026-11-22', 2);
    await upsertHabitLog(beer.id, '2026-11-21', 1);
    await upsertHabitLog(running.id, '2026-11-22', 5);

    await db.derived_metrics.add({
      id: crypto.randomUUID(),
      name: 'Avg Speed',
      unit: 'km/h',
      is_good: true,
      formula: 'km / hours',
      config_json: '{}',
      updated_at: Date.now(),
      deleted: 0,
      synced: 0
    });
    await db.plot_views.add({
      id: crypto.randomUUID(),
      title: 'Weekly Overview',
      config_json: '{}',
      sort_order: 0,
      updated_at: Date.now(),
      deleted: 0,
      synced: 0
    });

    const summary = await getUnsyncedSummary();

    expect(summary.habits).toHaveLength(2);
    expect(summary.derivedMetrics).toHaveLength(1);
    expect(summary.plotViews).toHaveLength(1);
    expect(summary.logs).toHaveLength(3);
    expect(summary.total).toBe(2 + 1 + 1 + 3);

    expect(summary.logsByHabit).toHaveLength(2);
    const beerEntry = summary.logsByHabit.find((entry) => entry.habitId === beer.id);
    expect(beerEntry?.count).toBe(2);
    expect(beerEntry?.info?.name).toBe('Beer');
    const runningEntry = summary.logsByHabit.find((entry) => entry.habitId === running.id);
    expect(runningEntry?.count).toBe(1);
    expect(runningEntry?.info?.name).toBe('Running');
  });

  it('excludes rows that are already synced', async () => {
    const habit = await saveHabit({
      name: 'Meditation',
      data_type: 'binary',
      unit: null,
      is_good: true,
      default_value: null,
      widget_type: 'toggle',
      config_json: '{}'
    });
    await upsertHabitLog(habit.id, '2026-11-22', 1);

    await db.habits.update(habit.id, { synced: 1 });
    const [log] = await db.habit_logs.toArray();
    await db.habit_logs.update(log.id, { synced: 1 });

    const summary = await getUnsyncedSummary();
    expect(summary.total).toBe(0);
    expect(summary.logsByHabit).toHaveLength(0);
  });
});
