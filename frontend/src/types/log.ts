export interface HabitLog {
  id: string; // UUID v4
  habit_id: string; // References habits.id
  date: string; // Format: YYYY-MM-DD
  value: number;
  updated_at: number; // Unix epoch ms
  deleted: number; // 0 for active, 1 for soft-deleted
  synced: number; // 0 for unsynced, 1 for synced
}
