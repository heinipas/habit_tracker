import { db } from '../db/db';
import type { DerivedMetric, Habit, HabitLog, PlotView } from '../types';

export interface HabitInfo {
  name: string;
  emoji: string | null;
}

export interface UnsyncedHabitEntry {
  habitId: string;
  count: number;
  info: HabitInfo | null;
}

export interface UnsyncedSummary {
  habits: Habit[];
  derivedMetrics: DerivedMetric[];
  plotViews: PlotView[];
  logs: HabitLog[];
  /** Sum of all four counts — drives the badge on the status dot. */
  total: number;
  /** Unsynchronised log entries grouped per habit (newest habit name resolved). */
  logsByHabit: UnsyncedHabitEntry[];
}

/** All local changes that have not been pushed to the server yet (`synced = 0`). */
export async function getUnsyncedSummary(): Promise<UnsyncedSummary> {
  const [habits, derivedMetrics, plotViews, logs, allHabits] = await Promise.all([
    db.habits.where('synced').equals(0).toArray(),
    db.derived_metrics.where('synced').equals(0).toArray(),
    db.plot_views.where('synced').equals(0).toArray(),
    db.habit_logs.where('synced').equals(0).toArray(),
    db.habits.toArray()
  ]);

  const habitById = new Map(allHabits.map((habit) => [habit.id, habit]));
  const counts = new Map<string, number>();
  for (const log of logs) {
    counts.set(log.habit_id, (counts.get(log.habit_id) ?? 0) + 1);
  }
  const logsByHabit: UnsyncedHabitEntry[] = [...counts.entries()]
    .map(([habitId, count]) => {
      const habit = habitById.get(habitId);
      return {
        habitId,
        count,
        info: habit ? { name: habit.name, emoji: habit.emoji ?? null } : null
      };
    })
    .sort((a, b) => b.count - a.count);

  return {
    habits,
    derivedMetrics,
    plotViews,
    logs,
    total: habits.length + derivedMetrics.length + plotViews.length + logs.length,
    logsByHabit
  };
}
