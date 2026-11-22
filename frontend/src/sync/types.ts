import type { DerivedMetric, Habit, HabitLog, PlotView } from '../types';

/** Rows as the server stores them — without the local-only `synced` flag. */
export type ServerHabit = Omit<Habit, 'synced'>;
export type ServerHabitLog = Omit<HabitLog, 'synced'>;
export type ServerDerivedMetric = Omit<DerivedMetric, 'synced'>;
export type ServerPlotView = Omit<PlotView, 'synced'>;

/** Client → server request. Rows are sent as-is; the server ignores `synced`. */
export interface SyncRequest {
  last_synced_at: number;
  habits: Habit[];
  habit_logs: HabitLog[];
  derived_metrics: DerivedMetric[];
  plot_views: PlotView[];
}

/** Server → client response (Last-Write-Wins candidates per table). */
export interface SyncResponse {
  server_time: number;
  habits: ServerHabit[];
  habit_logs: ServerHabitLog[];
  derived_metrics: ServerDerivedMetric[];
  plot_views: ServerPlotView[];
}

export interface HealthResponse {
  status: string;
  server_time: number;
  version: string;
}

/** A pull-only sync: nothing is pushed, everything on the server is returned. */
export function emptySyncRequest(): SyncRequest {
  return {
    last_synced_at: 0,
    habits: [],
    habit_logs: [],
    derived_metrics: [],
    plot_views: []
  };
}
