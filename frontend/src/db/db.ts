import Dexie, { type Table } from 'dexie';
import type { Habit, HabitLog, DerivedMetric, PlotView } from '../types';

export class HabitTrackerDB extends Dexie {
  habits!: Table<Habit, string>;
  habit_logs!: Table<HabitLog, string>;
  derived_metrics!: Table<DerivedMetric, string>;
  plot_views!: Table<PlotView, string>;

  constructor() {
    super('HabitTrackerDB');
    this.version(1).stores({
      habits: 'id, name, widget_type, updated_at, deleted, synced',
      habit_logs: 'id, habit_id, date, [habit_id+date], updated_at, deleted, synced',
      derived_metrics: 'id, name, updated_at, deleted, synced',
      plot_views: 'id, sort_order, updated_at, deleted, synced'
    });
  }
}

export const db = new HabitTrackerDB();
