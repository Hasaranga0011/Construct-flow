import React from 'react';
export function DateField({ value, onChange, label, mode = 'date' }: { value: string; onChange: (value: string) => void; label: string; mode?: 'date' | 'time' }) {
  return <input aria-label={label} type={mode} value={value} onChange={event => onChange(event.target.value)} className="w-full rounded-lg border border-gray-300 bg-gray-50 p-4 text-brand-text" style={{ minHeight: 48, minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' }} />;
}
