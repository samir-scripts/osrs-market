import React from 'react';

interface PanelProps {
  title?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export default function Panel({ title, headerRight, children, className = '', style }: PanelProps) {
  return (
    <div className={`panel ${className}`} style={style}>
      {title && (
        <div className="panel-header">
          <span>{title}</span>
          {headerRight && <div>{headerRight}</div>}
        </div>
      )}
      <div className="panel-body">
        {children}
      </div>
    </div>
  );
}
