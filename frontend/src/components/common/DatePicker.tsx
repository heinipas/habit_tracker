import React from 'react';

interface DatePickerProps {
  selectedDate: string; // YYYY-MM-DD
  onDateChange: (newDate: string) => void;
}

export const DatePicker: React.FC<DatePickerProps> = ({ selectedDate, onDateChange }) => {
  const getShiftedDate = (days: number): string => {
    const d = new Date(selectedDate + 'T12:00:00'); // Use noon to avoid timezone shift
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  };

  const getTodayDate = (): string => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  return (
    <div
      style={{
        marginBottom: '1rem',
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.4rem'
      }}
    >
      <label htmlFor="tracker-date"><strong>Date: </strong></label>
      <input
        id="tracker-date"
        type="date"
        value={selectedDate}
        onChange={(e) => onDateChange(e.target.value)}
        style={{ width: '9.5rem', maxWidth: '100%', minWidth: 0 }}
      />
      <button type="button" onClick={() => onDateChange(getShiftedDate(-1))}>
        &larr; Prev Day
      </button>
      <button type="button" onClick={() => onDateChange(getTodayDate())}>
        Today
      </button>
      <button type="button" onClick={() => onDateChange(getShiftedDate(1))}>
        Next Day &rarr;
      </button>
    </div>
  );
};
