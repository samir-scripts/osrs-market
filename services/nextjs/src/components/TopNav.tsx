'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from './ThemeProvider';
import { Sun, Moon } from 'lucide-react';

export default function TopNav() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  // Safe check since it might be null during SSR or certain next phases
  const safePathname = pathname || '';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      background: 'var(--color-bg)',
      borderBottom: '1px solid var(--color-border)',
      padding: '0 16px',
      height: '48px',
      gap: '24px',
      flexShrink: 0
    }}>
      <div style={{ fontWeight: 'bold', fontSize: '16px', color: 'var(--color-text)', letterSpacing: '0.05em' }}>
        OSRS MARKET
      </div>
      
      <div style={{ display: 'flex', gap: '16px', height: '100%', flex: 1 }}>
        <Link 
          href="/catalogue"
          style={{
            display: 'flex',
            alignItems: 'center',
            height: '100%',
            color: safePathname.startsWith('/catalogue') ? 'var(--color-bg)' : 'var(--color-text)',
            background: safePathname.startsWith('/catalogue') ? 'var(--color-text)' : 'transparent',
            textDecoration: 'none',
            padding: '0 12px',
            fontSize: '12px',
            fontWeight: 'bold',
            textTransform: 'uppercase',
            transition: 'all 0.1s'
          }}
        >
          [ CATALOGUE ]
        </Link>
        <Link 
          href="/top-movers"
          style={{
            display: 'flex',
            alignItems: 'center',
            height: '100%',
            color: safePathname.startsWith('/top-movers') ? 'var(--color-bg)' : 'var(--color-text)',
            background: safePathname.startsWith('/top-movers') ? 'var(--color-text)' : 'transparent',
            textDecoration: 'none',
            padding: '0 12px',
            fontSize: '12px',
            fontWeight: 'bold',
            textTransform: 'uppercase',
            transition: 'all 0.1s'
          }}
        >
          [ TOP MOVERS ]
        </Link>
      </div>

      <button
        onClick={toggleTheme}
        style={{
          background: 'transparent',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text)',
          cursor: 'pointer',
          padding: '4px 8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.15s ease'
        }}
        className="osrs-btn"
        aria-label="Toggle theme"
      >
        {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
      </button>
    </div>
  );
}
