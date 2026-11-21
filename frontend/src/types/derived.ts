export interface DerivedMetric {
  id: string; // UUID v4
  name: string;
  emoji?: string | null;
  unit: string | null;
  is_good: boolean;
  formula: string;
  config_json: string; // stores optional target, chart preferences, etc.
  updated_at: number; // Unix epoch ms
  deleted: number; // 0 for active, 1 for soft-deleted
  synced: number; // 0 for unsynced, 1 for synced
}
