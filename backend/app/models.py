from pydantic import BaseModel, ConfigDict, Field


class RowModel(BaseModel):
    # The client may send extra fields (e.g. the local-only `synced` flag);
    # never reject a sync because of them.
    model_config = ConfigDict(extra="ignore")


class HabitRow(RowModel):
    id: str
    updated_at: int
    name: str = ""
    emoji: str | None = None
    data_type: str = "float"
    unit: str | None = None
    is_good: bool = True
    default_value: float | None = None
    widget_type: str = "numeric"
    config_json: str = "{}"
    sort_order: int | None = None
    deleted: int = 0


class HabitLogRow(RowModel):
    id: str
    updated_at: int
    habit_id: str = ""
    date: str = ""
    value: float = 0.0
    deleted: int = 0


class DerivedMetricRow(RowModel):
    id: str
    updated_at: int
    name: str = ""
    emoji: str | None = None
    unit: str | None = None
    is_good: bool = True
    formula: str = "0"
    config_json: str = "{}"
    deleted: int = 0


class PlotViewRow(RowModel):
    id: str
    updated_at: int
    title: str = ""
    emoji: str | None = None
    config_json: str = "{}"
    sort_order: int = 0
    deleted: int = 0


class SyncRequest(RowModel):
    last_synced_at: int = 0
    habits: list[HabitRow] = Field(default_factory=list)
    habit_logs: list[HabitLogRow] = Field(default_factory=list)
    derived_metrics: list[DerivedMetricRow] = Field(default_factory=list)
    plot_views: list[PlotViewRow] = Field(default_factory=list)


class SyncResponse(BaseModel):
    server_time: int
    habits: list[HabitRow] = Field(default_factory=list)
    habit_logs: list[HabitLogRow] = Field(default_factory=list)
    derived_metrics: list[DerivedMetricRow] = Field(default_factory=list)
    plot_views: list[PlotViewRow] = Field(default_factory=list)


class HealthResponse(BaseModel):
    status: str
    server_time: int
    version: str
