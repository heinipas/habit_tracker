import { db } from './db';
import type { Habit, HabitLog, BackupPayload } from '../types';

/**
 * Get all active (non-deleted) habits
 */
export async function getActiveHabits(): Promise<Habit[]> {
  return await db.habits.where('deleted').equals(0).toArray();
}

/**
 * Save or update a habit definition
 */
export async function saveHabit(
  habit: Omit<Habit, 'id' | 'updated_at' | 'deleted' | 'synced'> & { id?: string }
): Promise<Habit> {
  if (habit.data_type === 'binary' && habit.widget_type !== 'toggle') {
    throw new Error('Binary habits only support the "toggle" widget type.');
  }
  if (habit.data_type !== 'binary' && habit.widget_type === 'toggle') {
    throw new Error('Toggle widget is only supported for binary habits.');
  }
  if (habit.data_type === 'binary' && habit.default_value !== null && habit.default_value !== undefined) {
    if (habit.default_value !== 0 && habit.default_value !== 1) {
      throw new Error('Statistical default value for binary habit must be null, 0, or 1.');
    }
  }

  const now = Date.now();
  const id = habit.id || crypto.randomUUID();

  // Keep the current position when editing, otherwise append to the end
  const existing = habit.id ? await db.habits.get(habit.id) : undefined;
  let sortOrder = existing?.sort_order ?? habit.sort_order ?? null;
  if (sortOrder == null) {
    const allHabits = await db.habits.toArray();
    sortOrder = allHabits.reduce((max, h) => Math.max(max, h.sort_order ?? -1), -1) + 1;
  }

  const habitRecord: Habit = {
    ...habit,
    emoji: habit.emoji ? habit.emoji.trim() : null,
    id,
    sort_order: sortOrder,
    updated_at: now,
    deleted: 0,
    synced: 0
  };

  await db.habits.put(habitRecord);
  return habitRecord;
}

/**
 * Persist a new display order for the Daily Tracker (array index = position)
 */
export async function reorderHabits(orderedIds: string[]): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.habits, async () => {
    for (let index = 0; index < orderedIds.length; index++) {
      await db.habits.update(orderedIds[index], {
        sort_order: index,
        updated_at: now,
        synced: 0
      });
    }
  });
}

/**
 * Soft delete a habit
 */
export async function softDeleteHabit(id: string): Promise<void> {
  await db.habits.update(id, {
    deleted: 1,
    updated_at: Date.now(),
    synced: 0
  });
}

/**
 * Get active log for a specific habit on a given date (YYYY-MM-DD)
 */
export async function getLogForHabitAndDate(habitId: string, date: string): Promise<HabitLog | undefined> {
  return await db.habit_logs
    .where('[habit_id+date]')
    .equals([habitId, date])
    .filter((log) => log.deleted === 0)
    .first();
}

/**
 * Upsert a log entry (or revive a soft-deleted entry)
 */
export async function upsertHabitLog(habitId: string, date: string, value: number): Promise<HabitLog> {
  const now = Date.now();
  const existing = await db.habit_logs
    .where('[habit_id+date]')
    .equals([habitId, date])
    .first();

  if (existing) {
    const updated: HabitLog = {
      ...existing,
      value,
      updated_at: now,
      deleted: 0,
      synced: 0
    };
    await db.habit_logs.put(updated);
    return updated;
  }

  const newLog: HabitLog = {
    id: crypto.randomUUID(),
    habit_id: habitId,
    date,
    value,
    updated_at: now,
    deleted: 0,
    synced: 0
  };
  await db.habit_logs.add(newLog);
  return newLog;
}

/**
 * Increment / accumulate value for a habit on a date (e.g. for preset accumulator or counter)
 */
export async function accumulateHabitLog(
  habitId: string,
  date: string,
  delta: number,
  defaultBase = 0
): Promise<HabitLog> {
  const existing = await getLogForHabitAndDate(habitId, date);
  const currentValue = existing ? existing.value : defaultBase;
  // Round to 4 decimal places to prevent float precision drift
  const newValue = Math.round((currentValue + delta) * 10000) / 10000;
  return await upsertHabitLog(habitId, date, newValue);
}

/**
 * Soft delete a log entry
 */
export async function softDeleteHabitLog(id: string): Promise<void> {
  await db.habit_logs.update(id, {
    deleted: 1,
    updated_at: Date.now(),
    synced: 0
  });
}

/**
 * Query active recent logs across all habits
 */
export async function getRecentLogs(limit = 100): Promise<HabitLog[]> {
  const logs = await db.habit_logs
    .where('deleted')
    .equals(0)
    .reverse()
    .sortBy('date');

  return logs.slice(0, limit);
}

/**
 * Export full database to JSON payload
 */
export async function exportDatabaseToJson(): Promise<BackupPayload> {
  const [habits, habit_logs, derived_metrics, plot_views] = await Promise.all([
    db.habits.toArray(),
    db.habit_logs.toArray(),
    db.derived_metrics.toArray(),
    db.plot_views.toArray()
  ]);

  return {
    version: 1,
    exported_at: Date.now(),
    habits,
    habit_logs,
    derived_metrics,
    plot_views
  };
}

/**
 * Import database from JSON payload with 'merge' or 'replace' mode
 */
export async function importDatabaseFromJson(
  payload: BackupPayload,
  mode: 'merge' | 'replace'
): Promise<{ habitsCount: number; logsCount: number }> {
  if (!payload || payload.version !== 1) {
    throw new Error('Invalid backup file or unsupported version');
  }

  return await db.transaction('rw', [db.habits, db.habit_logs, db.derived_metrics, db.plot_views], async () => {
    if (mode === 'replace') {
      await Promise.all([
        db.habits.clear(),
        db.habit_logs.clear(),
        db.derived_metrics.clear(),
        db.plot_views.clear()
      ]);

      // Imported rows are queued for push so restored data reaches the server.
      if (payload.habits?.length)
        await db.habits.bulkAdd(payload.habits.map((row) => ({ ...row, synced: 0 })));
      if (payload.habit_logs?.length)
        await db.habit_logs.bulkAdd(payload.habit_logs.map((row) => ({ ...row, synced: 0 })));
      if (payload.derived_metrics?.length)
        await db.derived_metrics.bulkAdd(payload.derived_metrics.map((row) => ({ ...row, synced: 0 })));
      if (payload.plot_views?.length)
        await db.plot_views.bulkAdd(payload.plot_views.map((row) => ({ ...row, synced: 0 })));

      return {
        habitsCount: payload.habits?.length || 0,
        logsCount: payload.habit_logs?.length || 0
      };
    } else {
      // Merge mode: Last-Write-Wins on updated_at
      let habitsUpserted = 0;
      let logsUpserted = 0;

      for (const incoming of payload.habits || []) {
        const existing = await db.habits.get(incoming.id);
        if (!existing || incoming.updated_at >= existing.updated_at) {
          // `synced = 0` queues the restored row for the next push.
          await db.habits.put({ ...incoming, synced: 0 });
          habitsUpserted++;
        }
      }

      for (const incoming of payload.habit_logs || []) {
        const existing = await db.habit_logs.get(incoming.id);
        if (!existing || incoming.updated_at >= existing.updated_at) {
          await db.habit_logs.put({ ...incoming, synced: 0 });
          logsUpserted++;
        }
      }

      for (const incoming of payload.derived_metrics || []) {
        const existing = await db.derived_metrics.get(incoming.id);
        if (!existing || incoming.updated_at >= existing.updated_at) {
          await db.derived_metrics.put({ ...incoming, synced: 0 });
        }
      }

      for (const incoming of payload.plot_views || []) {
        const existing = await db.plot_views.get(incoming.id);
        if (!existing || incoming.updated_at >= existing.updated_at) {
          await db.plot_views.put({ ...incoming, synced: 0 });
        }
      }

      return {
        habitsCount: habitsUpserted,
        logsCount: logsUpserted
      };
    }
  });
}

/**
 * Clear all tables (reset database)
 */
export async function clearAllData(): Promise<void> {
  await Promise.all([
    db.habits.clear(),
    db.habit_logs.clear(),
    db.derived_metrics.clear(),
    db.plot_views.clear()
  ]);
}
