export interface PlotView {
  id: string; // UUID v4
  title: string;
  emoji?: string | null;
  config_json: string; // Chart type, metrics, bucket, date range, show_targets
  sort_order: number;
  updated_at: number; // Unix epoch ms
  deleted: number; // 0 for active, 1 for soft-deleted
  synced: number; // 0 for unsynced, 1 for synced
}
