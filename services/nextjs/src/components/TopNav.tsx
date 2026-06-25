'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function TopNav() {
  const pathname = usePathname();
  // Safe check since it might be null during SSR or certain next phases
  const safePathname = pathname || '';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      background: '#0c0a09',
      borderBottom: '1px solid #f5f5f4',
      padding: '0 16px',
      height: '48px',
      gap: '24px',
      flexShrink: 0
    }}>
      <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#f5f5f4', letterSpacing: '0.05em' }}>
        OSRS MARKET
      </div>
      
      <div style={{ display: 'flex', gap: '16px', height: '100%' }}>
        <Link 
          href="/catalogue"
          style={{
            display: 'flex',
            alignItems: 'center',
            height: '100%',
            color: safePathname.startsWith('/catalogue') ? '#0c0a09' : '#f5f5f4',
            background: safePathname.startsWith('/catalogue') ? '#f5f5f4' : 'transparent',
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
            color: safePathname.startsWith('/top-movers') ? '#0c0a09' : '#f5f5f4',
            background: safePathname.startsWith('/top-movers') ? '#f5f5f4' : 'transparent',
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
    </div>
  );
}
