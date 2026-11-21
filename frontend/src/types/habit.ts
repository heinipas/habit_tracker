export type DataType = 'binary' | 'float';

export type WidgetType = 'toggle' | 'counter' | 'numeric' | 'preset_accumulator';

export interface PresetItem {
  label: string;
  delta: number;
  emoji?: string | null;
}

export interface TargetConfig {
  value: number;
  period: 'daily' | 'weekly' | 'monthly';
  operator: 'gte' | 'lte';
}

export interface HabitConfig {
  presets?: PresetItem[];
  default_picker_value?: number | null;
  step?: number;
  min?: number;
  max?: number;
  target?: TargetConfig;
  color?: string;
  icon?: string;
}

export interface Habit {
  id: string; // UUID v4
  name: string;
  emoji?: string | null;
  data_type: DataType;
  unit: string | null;
  is_good: boolean;
  default_value: number | null; // null = ignore unlogged days in stats, number = fixed baseline
  widget_type: WidgetType;
  config_json: string; // JSON serialized HabitConfig
  updated_at: number; // Unix epoch ms
  deleted: number; // 0 for active, 1 for soft-deleted
  synced: number; // 0 for unsynced, 1 for synced
}
