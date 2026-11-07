import React from 'react';
import { useApp } from '../context/AppContext';
import {
  CheckCircle2,
  AlertCircle,
  Coins,
  Info,
  AlertTriangle,
  X,
} from 'lucide-react';

export const GlobalToast = () => {
  const { toasts, dismissToast } = useApp();

  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="toast-wrap" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((t) => {
        const type = t.type || 'normal';
        const isCoin = type === 'coin';
        const isDanger = type === 'danger' || type === 'error';
        const isSuccess = type === 'success';
        const isWarning = type === 'warning';
        const isInfo = type === 'info';

        return (
          <div
            key={t.id}
            className={`toast ${isDanger ? 'danger' : isCoin ? 'coin' : isSuccess ? 'success' : isWarning ? 'warning' : isInfo ? 'info' : ''}`}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              position: 'relative',
            }}
          >
            <div style={{ flexShrink: 0, marginTop: '1px' }}>
              {isCoin && <Coins className="w-5 h-5 text-amber-500 animate-bounce" />}
              {isSuccess && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
              {isDanger && <AlertCircle className="w-5 h-5 text-red-500" />}
              {isWarning && <AlertTriangle className="w-5 h-5 text-amber-600" />}
              {isInfo && <Info className="w-5 h-5 text-blue-500" />}
              {!isCoin && !isSuccess && !isDanger && !isWarning && !isInfo && (
                <CheckCircle2 className="w-5 h-5 text-amber-500" />
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0, paddingRight: '14px' }}>
              <div className="toast-title">{t.title}</div>
              {t.desc && <div className="toast-desc">{t.desc}</div>}
            </div>

            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              className="toast-close-btn"
              title="Dismiss"
              aria-label="Dismiss alert"
              style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#94a3b8',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                transition: 'color 0.15s ease, background 0.15s ease',
              }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
