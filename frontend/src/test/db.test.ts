import './setup';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/db';
import {
  saveHabit,
  softDeleteHabit,
  getActiveHabits,
  upsertHabitLog,
  getLogForHabitAndDate,
  softDeleteHabitLog,
  reorderHabits,
  clearAllData
} from '../db/queries';

describe('IndexedDB CRUD and Soft Deletes', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('creates and retrieves active habits with statistical default and picker default', async () => {
    const habit = await saveHabit({
      name: 'Cycling',
      data_type: 'float',
      unit: 'km',
      is_good: true,
      default_value: 0, // Unlogged days count as 0 km
      widget_type: 'counter',
      config_json: JSON.stringify({ default_picker_value: 15.0 })
    });

    expect(habit.id).toBeDefined();
    expect(habit.deleted).toBe(0);
    expect(habit.synced).toBe(0);
    expect(habit.default_value).toBe(0);

    const active = await getActiveHabits();
    expect(active.length).toBe(1);
    expect(active[0].name).toBe('Cycling');

    // Verify config_json parsing
    const parsedConfig = JSON.parse(active[0].config_json);
    expect(parsedConfig.default_picker_value).toBe(15.0);
  });

  it('handles null default_value for missing data in statistics', async () => {
    const habit = await saveHabit({
      name: 'Weight',
      data_type: 'float',
      unit: 'kg',
      is_good: true,
      default_value: null, // Unlogged days are treated as missing
      widget_type: 'counter',
      config_json: JSON.stringify({ default_picker_value: 75.0 })
    });

    expect(habit.default_value).toBeNull();
    const active = await getActiveHabits();
    expect(active[0].default_value).toBeNull();
  });

  it('validates statistical default_value for binary habits (only null, 0, or 1 allowed)', async () => {
    // Valid: null
    const hNull = await saveHabit({
      name: 'Floss Teeth',
      data_type: 'binary',
      unit: null,
      is_good: true,
      default_value: null,
      widget_type: 'toggle',
      config_json: '{}'
    });
    expect(hNull.default_value).toBeNull();

    // Valid: 0
    const hZero = await saveHabit({
      name: 'No Sugar',
      data_type: 'binary',
      unit: null,
      is_good: true,
      default_value: 0,
      widget_type: 'toggle',
      config_json: '{}'
    });
    expect(hZero.default_value).toBe(0);

    // Valid: 1
    const hOne = await saveHabit({
      name: 'Make Bed',
      data_type: 'binary',
      unit: null,
      is_good: true,
      default_value: 1,
      widget_type: 'toggle',
      config_json: '{}'
    });
    expect(hOne.default_value).toBe(1);

    // Invalid: e.g. 5 or -1
    await expect(
      saveHabit({
        name: 'Invalid Binary Habit',
        data_type: 'binary',
        unit: null,
        is_good: true,
        default_value: 5,
        widget_type: 'toggle',
        config_json: '{}'
      })
    ).rejects.toThrow('Statistical default value for binary habit must be null, 0, or 1.');
  });

  it('soft-deletes habit (deleted = 1) and filters it out of active queries', async () => {
    const habit = await saveHabit({
      name: 'Meditation',
      data_type: 'float',
      unit: 'mins',
      is_good: true,
      default_value: 0,
      widget_type: 'counter',
      config_json: '{}'
    });

    await softDeleteHabit(habit.id);

    const active = await getActiveHabits();
    expect(active.length).toBe(0);

    // Verify record still exists in table with deleted = 1 and synced = 0
    const raw = await db.habits.get(habit.id);
    expect(raw?.deleted).toBe(1);
    expect(raw?.synced).toBe(0);
  });

  it('upserts habit log on (habit_id, date) and handles soft delete', async () => {
    const habit = await saveHabit({
      name: 'Reading',
      data_type: 'float',
      unit: 'pages',
      is_good: true,
      default_value: 0,
      widget_type: 'counter',
      config_json: '{}'
    });

    const date = '2026-11-21';
    await upsertHabitLog(habit.id, date, 20);

    let log = await getLogForHabitAndDate(habit.id, date);
    expect(log).toBeDefined();
    expect(log?.value).toBe(20);
    expect(log?.synced).toBe(0);

    // Update log on same day
    await upsertHabitLog(habit.id, date, 35);
    log = await getLogForHabitAndDate(habit.id, date);
    expect(log?.value).toBe(35);

    // Soft delete log
    await softDeleteHabitLog(log!.id);
    log = await getLogForHabitAndDate(habit.id, date);
    expect(log).toBeUndefined();
  });

  it('indexes synced flag as 0 | 1 and queries unsynced records reliably', async () => {
    await saveHabit({
      name: 'Unsynced Habit',
      data_type: 'binary',
      unit: null,
      is_good: true,
      default_value: 0,
      widget_type: 'toggle',
      config_json: '{}'
    });

    const unsynced = await db.habits.where('synced').equals(0).toArray();
    expect(unsynced.length).toBe(1);

    // Mark as synced = 1
    await db.habits.update(unsynced[0].id, { synced: 1 });
    const unsyncedAfter = await db.habits.where('synced').equals(0).toArray();
    expect(unsyncedAfter.length).toBe(0);

    const synced = await db.habits.where('synced').equals(1).toArray();
    expect(synced.length).toBe(1);
  });

  it('validates widget_type rules based on data_type', async () => {
    // Binary habit with non-toggle widget should throw
    await expect(
      saveHabit({
        name: 'Invalid Binary',
        data_type: 'binary',
        unit: null,
        is_good: true,
        default_value: 0,
        widget_type: 'counter' as any,
        config_json: '{}'
      })
    ).rejects.toThrow('Binary habits only support the "toggle" widget type.');

    // Float habit with toggle widget should throw
    await expect(
      saveHabit({
        name: 'Invalid Float',
        data_type: 'float',
        unit: 'km',
        is_good: true,
        default_value: 0,
        widget_type: 'toggle',
        config_json: '{}'
      })
    ).rejects.toThrow('Toggle widget is only supported for binary habits.');
  });

  it('stores widget-specific default picker values', async () => {
    // Preset accumulator custom delta default picker value: 1.5
    const presetHabit = await saveHabit({
      name: 'Coffee',
      data_type: 'float',
      unit: 'cups',
      is_good: true,
      default_value: 0,
      widget_type: 'preset_accumulator',
      config_json: JSON.stringify({ default_picker_value: 1.5 })
    });
    const parsedPreset = JSON.parse(presetHabit.config_json);
    expect(parsedPreset.default_picker_value).toBe(1.5);
  });

  it('appends new habits to the end and keeps their position when editing', async () => {
    const first = await saveHabit({
      name: 'Meditation',
      data_type: 'binary',
      unit: null,
      is_good: true,
      default_value: null,
      widget_type: 'toggle',
      config_json: '{}'
    });
    const second = await saveHabit({
      name: 'Cycling',
      data_type: 'float',
      unit: 'km',
      is_good: true,
      default_value: 0,
      widget_type: 'counter',
      config_json: '{}'
    });

    expect(first.sort_order).toBe(0);
    expect(second.sort_order).toBe(1);

    const edited = await saveHabit({
      id: first.id,
      name: 'Deep Meditation',
      data_type: 'binary',
      unit: null,
      is_good: true,
      default_value: null,
      widget_type: 'toggle',
      config_json: '{}'
    });
    expect(edited.sort_order).toBe(0);
  });

  it('persists an optional color in config_json without schema changes', async () => {
    const habit = await saveHabit({
      name: 'Cycling',
      data_type: 'float',
      unit: 'km',
      is_good: true,
      default_value: 0,
      widget_type: 'counter',
      config_json: JSON.stringify({ step: 5, color: '#3b82f6' })
    });

    const stored = await db.habits.get(habit.id);
    expect(JSON.parse(stored!.config_json).color).toBe('#3b82f6');

    // Editing without a color clears it while keeping other config keys
    const edited = await saveHabit({
      id: habit.id,
      name: 'Cycling',
      data_type: 'float',
      unit: 'km',
      is_good: true,
      default_value: 0,
      widget_type: 'counter',
      config_json: JSON.stringify({ step: 5, color: undefined })
    });
    const editedStored = await db.habits.get(edited.id);
    const editedConfig = JSON.parse(editedStored!.config_json);
    expect(editedConfig.color).toBeUndefined();
    expect(editedConfig.step).toBe(5);
  });

  it('persists habit reordering for the Daily Tracker', async () => {
    const a = await saveHabit({
      name: 'Meditation',
      data_type: 'binary',
      unit: null,
      is_good: true,
      default_value: null,
      widget_type: 'toggle',
      config_json: '{}'
    });
    const b = await saveHabit({
      name: 'Cycling',
      data_type: 'float',
      unit: 'km',
      is_good: true,
      default_value: 0,
      widget_type: 'counter',
      config_json: '{}'
    });
    const c = await saveHabit({
      name: 'Reading',
      data_type: 'float',
      unit: 'pages',
      is_good: true,
      default_value: 0,
      widget_type: 'counter',
      config_json: '{}'
    });

    await reorderHabits([c.id, a.id, b.id]);

    const active = await getActiveHabits();
    const sortOrderById = new Map(
      active.map((habit): [string, number | null | undefined] => [habit.id, habit.sort_order])
    );
    expect(sortOrderById.get(c.id)).toBe(0);
    expect(sortOrderById.get(a.id)).toBe(1);
    expect(sortOrderById.get(b.id)).toBe(2);
  });
});
