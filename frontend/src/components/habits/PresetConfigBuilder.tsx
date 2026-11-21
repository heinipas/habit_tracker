import React from 'react';
import type { PresetItem } from '../../types';

interface PresetConfigBuilderProps {
  presets: PresetItem[];
  onChange: (presets: PresetItem[]) => void;
}

export const PresetConfigBuilder: React.FC<PresetConfigBuilderProps> = ({ presets, onChange }) => {
  const handleAddPreset = () => {
    onChange([...presets, { emoji: '', label: 'Item', delta: 1.0 }]);
  };

  const handleUpdate = (index: number, field: keyof PresetItem, value: string) => {
    const updated = [...presets];
    if (field === 'delta') {
      const num = parseFloat(value);
      updated[index] = { ...updated[index], delta: isNaN(num) ? 0 : num };
    } else if (field === 'emoji') {
      updated[index] = { ...updated[index], emoji: value };
    } else {
      updated[index] = { ...updated[index], label: value };
    }
    onChange(updated);
  };

  const handleRemove = (index: number) => {
    onChange(presets.filter((_, i) => i !== index));
  };

  return (
    <fieldset style={{ marginTop: '0.75rem' }}>
      <legend><strong>Accumulator Quick Presets</strong></legend>
      <p><small>Configure quick-tap delta buttons (e.g. Emoji: "🍺", Label: "Beer 5dl", Delta: 1.5).</small></p>

      {presets.length === 0 ? (
        <p><em>No presets defined yet. Tap "Add Preset" below.</em></p>
      ) : (
        <table border={1} cellPadding={4} style={{ borderCollapse: 'collapse', marginBottom: '0.5rem' }}>
          <thead>
            <tr>
              <th>Emoji</th>
              <th>Button Label</th>
              <th>Delta Value (+/-)</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {presets.map((preset, idx) => (
              <tr key={idx}>
                <td>
                  <input
                    type="text"
                    value={preset.emoji || ''}
                    onChange={(e) => handleUpdate(idx, 'emoji', e.target.value)}
                    placeholder="e.g. 🍺"
                    style={{ width: '50px', textAlign: 'center' }}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={preset.label}
                    onChange={(e) => handleUpdate(idx, 'label', e.target.value)}
                    placeholder="e.g. Regular"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="any"
                    value={preset.delta}
                    onChange={(e) => handleUpdate(idx, 'delta', e.target.value)}
                    style={{ width: '80px' }}
                  />
                </td>
                <td>
                  <button type="button" onClick={() => handleRemove(idx)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button type="button" onClick={handleAddPreset}>+ Add Preset Button</button>
    </fieldset>
  );
};
