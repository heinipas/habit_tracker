import type { Habit } from './habit';
import type { HabitLog } from './log';
import type { DerivedMetric } from './derived';
import type { PlotView } from './plot';

export interface BackupPayload {
  version: 1;
  exported_at: number;
  habits: Habit[];
  habit_logs: HabitLog[];
  derived_metrics: DerivedMetric[];
  plot_views: PlotView[];
}
