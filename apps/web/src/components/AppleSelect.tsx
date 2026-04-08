'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption {
  value: string;
  label: string;
}

interface AppleSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<string | SelectOption>;
  color?: string;
  triggerStyle?: React.CSSProperties;
}

export function AppleSelect({ value, onChange, options, color, triggerStyle }: AppleSelectProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);

  const normalizedOptions: SelectOption[] = options.map(o =>
    typeof o === 'string' ? { value: o, label: o } : o
  );

  const currentLabel = normalizedOptions.find(o => o.value === value)?.label ?? value;
  const isFullWidth = triggerStyle?.width === '100%';

  const openDropdown = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 6, left: rect.left });
    }
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const dropdown = open && typeof document !== 'undefined'
    ? createPortal(
        <div
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            zIndex: 99999,
            background: 'rgba(28,28,30,0.97)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderRadius: 14,
            boxShadow: '0 8px 40px rgba(0,0,0,0.7), 0 0 0 0.5px rgba(255,255,255,0.1)',
            overflow: 'hidden',
            minWidth: 200,
          }}
        >
          {normalizedOptions.map((opt, i) => (
            <button
              key={opt.value}
              onMouseDown={e => { e.stopPropagation(); onChange(opt.value); setOpen(false); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                padding: '13px 18px',
                background: 'none',
                border: 'none',
                borderTop: i > 0 ? '0.5px solid rgba(255,255,255,0.08)' : 'none',
                cursor: 'pointer',
                fontFamily: 'Satoshi,sans-serif',
                fontSize: 15,
                fontWeight: 400,
                color: '#fff',
                textAlign: 'left',
                gap: 12,
              }}
            >
              <span style={{ width: 20, fontSize: 14, color: '#0a84ff', flexShrink: 0, fontWeight: 600 }}>
                {opt.value === value ? '✓' : ''}
              </span>
              {opt.label}
            </button>
          ))}
        </div>,
        document.body
      )
    : null;

  return (
    <div style={{ position: 'relative', display: isFullWidth ? 'block' : 'inline-block' }}>
      <button
        ref={triggerRef}
        onClick={() => (open ? setOpen(false) : openDropdown())}
        style={{
          background: 'linear-gradient(135deg,rgba(255,255,255,0.09),rgba(255,255,255,0.03))',
          border: `1px solid ${color ? color + '55' : 'rgba(255,255,255,0.15)'}`,
          borderRadius: 9,
          padding: '5px 28px 5px 10px',
          fontFamily: 'Satoshi,sans-serif',
          fontSize: 11,
          fontWeight: 600,
          color: color ?? '#e0e0e0',
          outline: 'none',
          cursor: 'pointer',
          position: 'relative',
          whiteSpace: 'nowrap',
          width: isFullWidth ? '100%' : undefined,
          boxSizing: 'border-box',
          ...triggerStyle,
        }}
      >
        {currentLabel}
        <svg
          style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          width="10" height="6" viewBox="0 0 10 6" fill="none"
        >
          <path d="M1 1l4 4 4-4" stroke="#8a8a8a" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {dropdown}
    </div>
  );
}
