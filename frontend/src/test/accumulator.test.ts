import './setup';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveHabit,
  accumulateHabitLog,
  getLogForHabitAndDate,
  clearAllData
} from '../db/queries';

describe('Preset Accumulator and Value Correction', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('accumulates preset delta values for a single day', async () => {
    const habit = await saveHabit({
      name: 'Alcohol Units',
      data_type: 'float',
      unit: 'units',
      is_good: false,
      default_value: 0,
      widget_type: 'preset_accumulator',
      config_json: JSON.stringify({
        presets: [
          { label: 'Beer 3.3dl', delta: 1.0 },
          { label: 'Beer 5.0dl', delta: 1.5 },
          { label: 'Wine', delta: 1.0 }
        ]
      })
    });

    const date = '2026-11-21';

    // Tap Beer 3.3dl (+1.0)
    await accumulateHabitLog(habit.id, date, 1.0);
    let log = await getLogForHabitAndDate(habit.id, date);
    expect(log?.value).toBe(1.0);

    // Tap Beer 5.0dl (+1.5)
    await accumulateHabitLog(habit.id, date, 1.5);
    log = await getLogForHabitAndDate(habit.id, date);
    expect(log?.value).toBe(2.5);

    // Tap Wine (+1.0)
    await accumulateHabitLog(habit.id, date, 1.0);
    log = await getLogForHabitAndDate(habit.id, date);
    expect(log?.value).toBe(3.5);
  });

  it('allows adjusting the accumulated total via delta increments and decrements', async () => {
    const habit = await saveHabit({
      name: 'Alcohol Units',
      data_type: 'float',
      unit: 'units',
      is_good: false,
      default_value: 0,
      widget_type: 'preset_accumulator',
      config_json: '{}'
    });

    const date = '2026-11-21';

    // Initially accumulated to 4.5
    await accumulateHabitLog(habit.id, date, 4.5);
    let log = await getLogForHabitAndDate(habit.id, date);
    expect(log?.value).toBe(4.5);

    // Any target value can be achieved via the delta field (e.g. -1.5 delta brings total to 3.0)
    await accumulateHabitLog(habit.id, date, -1.5);
    log = await getLogForHabitAndDate(habit.id, date);
    expect(log?.value).toBe(3.0);

    // Subsequent preset additions should add onto the adjusted base
    await accumulateHabitLog(habit.id, date, 1.0);
    log = await getLogForHabitAndDate(habit.id, date);
    expect(log?.value).toBe(4.0);
  });

  it('supports configurable counter increment step', async () => {
    const habit = await saveHabit({
      name: 'Pushups',
      data_type: 'float',
      unit: 'reps',
      is_good: true,
      default_value: 0,
      widget_type: 'counter',
      config_json: JSON.stringify({ step: 5 })
    });

    const parsedConfig = JSON.parse(habit.config_json);
    const step = parsedConfig.step || 1;
    expect(step).toBe(5);

    const date = '2026-11-21';
    // Increment by step (+5)
    await accumulateHabitLog(habit.id, date, step);
    let log = await getLogForHabitAndDate(habit.id, date);
    expect(log?.value).toBe(5);

    // Increment again (+5)
    await accumulateHabitLog(habit.id, date, step);
    log = await getLogForHabitAndDate(habit.id, date);
    expect(log?.value).toBe(10);

    // Decrement by step (-5)
    await accumulateHabitLog(habit.id, date, -step);
    log = await getLogForHabitAndDate(habit.id, date);
    expect(log?.value).toBe(5);
  });

  it('respects default_picker_value as starting base on unlogged days', async () => {
    const habit = await saveHabit({
      name: 'Water Intake',
      data_type: 'float',
      unit: 'L',
      is_good: true,
      default_value: 0,
      widget_type: 'preset_accumulator',
      config_json: JSON.stringify({ default_picker_value: 1.5 })
    });

    const parsedConfig = JSON.parse(habit.config_json);
    const defaultPicker = parsedConfig.default_picker_value;
    expect(defaultPicker).toBe(1.5);

    const date = '2026-11-21';
    // When no log exists yet, accumulate starting from defaultPicker (1.5 + 0.5 = 2.0)
    await accumulateHabitLog(habit.id, date, 0.5, defaultPicker);
    const log = await getLogForHabitAndDate(habit.id, date);
    expect(log?.value).toBe(2.0);
  });
});
