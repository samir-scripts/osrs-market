import React from 'react';

interface LoadingScreenProps {
  itemsMetadataReady: boolean;
  priceStreamReady: boolean;
  analyticsReady: boolean;
  iconsReady: boolean;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  itemsMetadataReady,
  priceStreamReady,
  analyticsReady,
  iconsReady,
}) => {
  const backendReady = itemsMetadataReady && priceStreamReady && analyticsReady;
  
  return (
    <div className="loading-screen">
      <div className="loading-panel">
        <h1 className="loading-title">OSRS Market Value Tracker</h1>
        <div style={{ textAlign: 'center', margin: '8px 0', color: 'var(--color-text-muted)', fontSize: '11px' }}>
          ESTABLISHING CONNECTION TO BACKEND SERVICES
        </div>
        <div className="loading-list">
          <div className={`loading-check ${itemsMetadataReady ? 'ready' : ''}`}>
            <span className={`loading-indicator ${!itemsMetadataReady ? 'blink' : ''}`}>
              {itemsMetadataReady ? '[■]' : '[ ]'}
            </span>
            <span className="loading-status-text">ITEMS METADATA</span>
            <span className="loading-status-val">{itemsMetadataReady ? 'READY' : 'CONNECTING...'}</span>
          </div>

          <div className={`loading-check ${priceStreamReady ? 'ready' : ''}`}>
            <span className={`loading-indicator ${!priceStreamReady ? 'blink' : ''}`}>
              {priceStreamReady ? '[■]' : '[ ]'}
            </span>
            <span className="loading-status-text">PRICE STREAM</span>
            <span className="loading-status-val">{priceStreamReady ? 'READY' : 'CONNECTING...'}</span>
          </div>

          <div className={`loading-check ${analyticsReady ? 'ready' : ''}`}>
            <span className={`loading-indicator ${!analyticsReady ? 'blink' : ''}`}>
              {analyticsReady ? '[■]' : '[ ]'}
            </span>
            <span className="loading-status-text">ANALYTICS ENGINE</span>
            <span className="loading-status-val">{analyticsReady ? 'READY' : 'CONNECTING...'}</span>
          </div>

          <div className={`loading-check ${iconsReady ? 'ready' : ''}`}>
            <span className={`loading-indicator ${!iconsReady && backendReady ? 'blink' : ''}`}>
              {iconsReady ? '[■]' : '[ ]'}
            </span>
            <span className="loading-status-text">ITEM ICONS</span>
            <span className="loading-status-val">
              {iconsReady ? 'READY' : (backendReady ? 'PRELOADING...' : 'WAITING...')}
            </span>
          </div>
        </div>
        
        <div style={{ 
          marginTop: '16px', 
          borderTop: '2px solid var(--color-border)', 
          paddingTop: '12px',
          fontSize: '10px',
          color: 'var(--color-text-dim)',
          textAlign: 'center',
          letterSpacing: '0.05em'
        }}>
          {iconsReady ? 'LOADING COMPLETE' : (backendReady ? 'CACHING INTERFACE GRAPHICS' : 'PLEASE WAIT WHILE THE TICK STREAM INITIALIZES')}
        </div>
      </div>
    </div>
  );
};
