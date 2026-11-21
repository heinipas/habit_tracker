import './setup';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/db';
import {
  saveHabit,
  upsertHabitLog,
  exportDatabaseToJson,
  importDatabaseFromJson,
  clearAllData
} from '../db/queries';
import type { BackupPayload } from '../types';

describe('Data Portability: Export and Import', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('exports and restores all 4 tables in replace mode', async () => {
    const habit = await saveHabit({
      name: 'Hydration',
      data_type: 'float',
      unit: 'L',
      is_good: true,
      default_value: 0,
      widget_type: 'numeric',
      config_json: JSON.stringify({ default_picker_value: 2.0 })
    });

    await upsertHabitLog(habit.id, '2026-11-21', 2.5);

    // Scaffold a derived metric in the table
    await db.derived_metrics.add({
      id: crypto.randomUUID(),
      name: 'Hydration Target Ratio',
      unit: '%',
      is_good: true,
      formula: 'hydration / 2.0 * 100',
      config_json: '{}',
      updated_at: Date.now(),
      deleted: 0,
      synced: 0
    });

    const backup = await exportDatabaseToJson();
    expect(backup.version).toBe(1);
    expect(backup.habits.length).toBe(1);
    expect(backup.habit_logs.length).toBe(1);
    expect(backup.derived_metrics.length).toBe(1);
    expect(backup.plot_views.length).toBe(0);

    // Wipe local database
    await clearAllData();
    expect((await db.habits.toArray()).length).toBe(0);
    expect((await db.habit_logs.toArray()).length).toBe(0);

    // Restore from backup in 'replace' mode
    const result = await importDatabaseFromJson(backup, 'replace');
    expect(result.habitsCount).toBe(1);
    expect(result.logsCount).toBe(1);

    const restoredHabits = await db.habits.toArray();
    expect(restoredHabits.length).toBe(1);
    expect(restoredHabits[0].name).toBe('Hydration');

    const restoredLogs = await db.habit_logs.toArray();
    expect(restoredLogs.length).toBe(1);
    expect(restoredLogs[0].value).toBe(2.5);

    const restoredDerived = await db.derived_metrics.toArray();
    expect(restoredDerived.length).toBe(1);
    expect(restoredDerived[0].formula).toBe('hydration / 2.0 * 100');
  });

  it('merges records using Last-Write-Wins on updated_at', async () => {
    const habitId = crypto.randomUUID();
    const oldTimestamp = 1000;
    const newTimestamp = 2000;

    await db.habits.add({
      id: habitId,
      name: 'Original Habit',
      data_type: 'binary',
      unit: null,
      is_good: true,
      default_value: 0,
      widget_type: 'toggle',
      config_json: '{}',
      updated_at: oldTimestamp,
      deleted: 0,
      synced: 1
    });

    const incomingBackup: BackupPayload = {
      version: 1,
      exported_at: Date.now(),
      habits: [
        {
          id: habitId,
          name: 'Updated Habit from Server',
          data_type: 'binary',
          unit: null,
          is_good: true,
          default_value: 0,
          widget_type: 'toggle',
          config_json: '{}',
          updated_at: newTimestamp, // Newer!
          deleted: 0,
          synced: 1
        }
      ],
      habit_logs: [],
      derived_metrics: [],
      plot_views: []
    };

    await importDatabaseFromJson(incomingBackup, 'merge');

    const habit = await db.habits.get(habitId);
    expect(habit?.name).toBe('Updated Habit from Server');
    expect(habit?.updated_at).toBe(newTimestamp);
  });
});
