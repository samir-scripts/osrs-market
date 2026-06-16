import React from 'react';

interface StatRowProps {
  label: string;
  value: string | number;
  valueClass?: string;
}

export default function StatRow({ label, value, valueClass = '' }: StatRowProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border-light)' }}>
      <span style={{ color: 'var(--color-text-muted)', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <span style={{ fontWeight: 'bold' }} className={valueClass}>
        {value}
      </span>
    </div>
  );
}
