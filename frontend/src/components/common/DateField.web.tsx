import React from 'react';
export function DateField({ value, onChange, label, mode = 'date', disabled = false }: { value: string; onChange: (value: string) => void; label: string; mode?: 'date' | 'time'; disabled?: boolean }) {
  return <input disabled={disabled} aria-label={label} type={mode} value={value} onChange={event => onChange(event.target.value)} className={`w-full rounded-lg border border-gray-300 bg-gray-50 p-4 text-brand-text ${disabled?'opacity-50':''}`} style={{ minHeight: 48, minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' }} />;
}
