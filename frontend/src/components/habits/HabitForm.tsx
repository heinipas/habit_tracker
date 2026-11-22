import React, { useState } from 'react';
import type { Habit, DataType, WidgetType, HabitConfig, PresetItem } from '../../types';
import { saveHabit } from '../../db/queries';
import { PresetConfigBuilder } from './PresetConfigBuilder';

interface HabitFormProps {
  existingHabit?: Habit;
  onDone: () => void;
  onCancel: () => void;
}

export const HabitForm: React.FC<HabitFormProps> = ({ existingHabit, onDone, onCancel }) => {
  let initialConfig: HabitConfig = {};
  if (existingHabit?.config_json) {
    try {
      initialConfig = JSON.parse(existingHabit.config_json);
    } catch {
      // empty fallback
    }
  }

  const [name, setName] = useState<string>(existingHabit?.name || '');
  const [emoji, setEmoji] = useState<string>(existingHabit?.emoji || '');
  const [dataType, setDataType] = useState<DataType>(
    existingHabit?.data_type === 'binary' ? 'binary' : 'float'
  );
  const [unit, setUnit] = useState<string>(existingHabit?.unit || '');
  const [isGood, setIsGood] = useState<boolean>(existingHabit?.is_good ?? true);

  // Statistical default value: null = missing/ignored, number = baseline
  // For binary: only allowed to be null (empty string), 0, or 1
  const [defaultValue, setDefaultValue] = useState<string>(
    existingHabit?.default_value != null ? String(existingHabit.default_value) : ''
  );

  const initialWidgetType: WidgetType = existingHabit?.widget_type || (existingHabit?.data_type === 'binary' ? 'toggle' : 'counter');
  const [widgetType, setWidgetType] = useState<WidgetType>(initialWidgetType);

  // Default picker value: pre-fills the widget input on days without a log
  const [defaultPickerValue, setDefaultPickerValue] = useState<string>(
    initialConfig.default_picker_value != null ? String(initialConfig.default_picker_value) : ''
  );

  const [counterStep, setCounterStep] = useState<string>(
    initialConfig.step != null ? String(initialConfig.step) : '1'
  );
  const [presets, setPresets] = useState<PresetItem[]>(initialConfig.presets || []);
  const [error, setError] = useState<string | null>(null);

  const handleDataTypeChange = (newType: DataType) => {
    setDataType(newType);
    if (newType === 'binary') {
      setWidgetType('toggle');
      setDefaultPickerValue('');
      // Restrict default value to null, 0, or 1
      if (defaultValue !== '' && defaultValue !== '0' && defaultValue !== '1') {
        setDefaultValue('');
      }
    } else if (widgetType === 'toggle') {
      setWidgetType('counter');
      setDefaultPickerValue('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Habit name is required.');
      return;
    }

    const parsedStep = widgetType === 'counter' && counterStep.trim() !== '' ? parseFloat(counterStep) : undefined;
    let parsedDefaultValue: number | null = null;
    if (defaultValue.trim() !== '') {
      const num = parseFloat(defaultValue);
      parsedDefaultValue = !isNaN(num) ? num : null;
    }

    if (dataType === 'binary' && parsedDefaultValue !== null) {
      if (parsedDefaultValue !== 0 && parsedDefaultValue !== 1) {
        setError('Statistical default value for binary habit must be null, 0, or 1.');
        return;
      }
    }

    let parsedDefaultPicker: number | null = null;
    if (widgetType !== 'toggle' && defaultPickerValue.trim() !== '') {
      const num = parseFloat(defaultPickerValue);
      parsedDefaultPicker = !isNaN(num) ? num : null;
    }

    const config: HabitConfig = {
      ...initialConfig,
      step: parsedStep && parsedStep > 0 ? parsedStep : undefined,
      presets: widgetType === 'preset_accumulator' ? presets : undefined,
      // No picker default for binary toggles: the checkbox always starts unchecked
      default_picker_value: widgetType === 'toggle' ? undefined : parsedDefaultPicker
    };

    try {
      await saveHabit({
        id: existingHabit?.id,
        name: name.trim(),
        emoji: emoji.trim() ? emoji.trim() : null,
        data_type: dataType,
        unit: unit.trim() ? unit.trim() : null,
        is_good: isGood,
        default_value: parsedDefaultValue,
        widget_type: widgetType,
        config_json: JSON.stringify(config)
      });
      onDone();
    } catch (err) {
      setError((err as Error).message || 'Failed to save habit');
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ border: '1px solid #ccc', padding: '1rem', marginBottom: '1.5rem' }}>
      <h3>{existingHabit ? 'Edit Habit' : 'Create New Habit'}</h3>
      {error && <p style={{ color: 'red' }}><strong>{error}</strong></p>}

      <div style={{ marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div>
          <label htmlFor="habit-emoji"><strong>Emoji: </strong></label>
          <input
            id="habit-emoji"
            type="text"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            placeholder="e.g. 🏃"
            style={{ width: '50px', textAlign: 'center', fontSize: '1.0rem' }}
          />
        </div>

        <div>
          <label htmlFor="habit-name"><strong>Name: </strong></label>
          <input
            id="habit-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Meditation, Alcohol Units, Cycling"
            required
            style={{ width: '60%' }}
          />
        </div>
      </div>

      <div style={{ marginBottom: '0.75rem' }}>
        <label htmlFor="habit-data-type"><strong>Data Type: </strong></label>
        <select
          id="habit-data-type"
          value={dataType}
          onChange={(e) => handleDataTypeChange(e.target.value as DataType)}
        >
          <option value="binary">Binary (done / not done)</option>
          <option value="float">Numeric (quantifiable value)</option>
        </select>
      </div>

      <div style={{ marginBottom: '0.75rem' }}>
        <label htmlFor="habit-unit"><strong>Unit (Optional): </strong></label>
        <input
          id="habit-unit"
          type="text"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder="e.g. km, mins, units, glasses"
        />
      </div>

      <div style={{ marginBottom: '0.75rem' }}>
        <label>
          <input
            type="checkbox"
            checked={isGood}
            onChange={(e) => setIsGood(e.target.checked)}
          />
          {' '}
          <strong>Positive Habit</strong> (Uncheck for negative habits, e.g. alcohol / smoking)
        </label>
      </div>

      <div style={{ marginBottom: '0.75rem' }}>
        <label htmlFor="habit-widget-type"><strong>Widget Type: </strong></label>
        <select
          id="habit-widget-type"
          value={widgetType}
          onChange={(e) => setWidgetType(e.target.value as WidgetType)}
        >
          {dataType === 'binary' ? (
            <option value="toggle">Toggle (Checkbox)</option>
          ) : (
            <>
              <option value="counter">Counter (+/- Stepper)</option>
              <option value="preset_accumulator">Preset Accumulator (Quick-tap buttons)</option>
            </>
          )}
        </select>
      </div>

      <div style={{ marginBottom: '0.75rem' }}>
        <label htmlFor="habit-default-value">
          <strong>Statistical Default Value: </strong>
        </label>
        {dataType === 'binary' ? (
          <select
            id="habit-default-value"
            value={defaultValue}
            onChange={(e) => setDefaultValue(e.target.value)}
            style={{ minWidth: '160px' }}
          >
            <option value="">null (unlogged ignored)</option>
            <option value="0">0 (not done / false)</option>
            <option value="1">1 (done / true)</option>
          </select>
        ) : (
          <input
            id="habit-default-value"
            type="number"
            step="any"
            value={defaultValue}
            onChange={(e) => setDefaultValue(e.target.value)}
            placeholder="Empty for null (missing)"
            style={{ width: '140px' }}
          />
        )}
        <br />
        <small style={{ color: '#555' }}>
          {dataType === 'binary' ? (
            <>
              <code>null</code>: unlogged days ignored. <code>0</code>/<code>1</code>: unlogged days count as this baseline.
            </>
          ) : (
            <>
              Empty = <code>null</code> (unlogged days ignored). A number = unlogged days count as this baseline.
            </>
          )}
        </small>
      </div>

      {/* Widget-specific default picker value (not available for binary toggles) */}
      {widgetType !== 'toggle' && (
        <div style={{ marginBottom: '0.75rem' }}>
          <label><strong>Picker Value Preset (Optional):</strong></label>
          {widgetType === 'preset_accumulator' ? (
            <div>
              <input
                type="number"
                step="any"
                value={defaultPickerValue}
                onChange={(e) => setDefaultPickerValue(e.target.value)}
                placeholder="e.g. 1.0"
                style={{ width: '120px' }}
              />
              <br />
              <small style={{ color: '#555' }}>
                Pre-fills the custom delta field in the tracker.
              </small>
            </div>
          ) : (
            <div>
              <input
                type="number"
                step="any"
                value={defaultPickerValue}
                onChange={(e) => setDefaultPickerValue(e.target.value)}
                placeholder="e.g. 0"
                style={{ width: '120px' }}
              />
              <br />
              <small style={{ color: '#555' }}>
                Pre-fills the tracker input when no log exists yet.
              </small>
            </div>
          )}
        </div>
      )}

      {widgetType === 'counter' && (
        <div style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="habit-counter-step">
            <strong>Counter Increment / Step: </strong>
          </label>
          <input
            id="habit-counter-step"
            type="number"
            step="any"
            min="0.0001"
            value={counterStep}
            onChange={(e) => setCounterStep(e.target.value)}
            placeholder="e.g. 1, 5, 0.5"
            style={{ width: '100px' }}
          />
          <br />
          <small style={{ color: '#555' }}>
            Added/subtracted per tap (default 1).
          </small>
        </div>
      )}

      {widgetType === 'preset_accumulator' && (
        <PresetConfigBuilder
          presets={presets}
          onChange={setPresets}
        />
      )}

      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
        <button type="submit">Save Habit</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
};
