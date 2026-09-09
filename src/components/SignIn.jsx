import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Snai3iIcon } from './Snai3iIcon';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';

export const SignIn = () => {
  const { signIn } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const targetEmail = email.trim();
    if (!targetEmail) {
      setError('Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      const res = await signIn(targetEmail, password.trim() || 'password123');
      if (res && !res.success) {
        setError(res.error || 'Invalid credentials');
      }
    } catch (err) {
      setError(err?.message || 'Failed to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f5f6f9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        fontFamily: "'Montserrat', sans-serif",
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          background: '#ffffff',
          borderRadius: '24px',
          padding: '42px 36px 36px',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.05)',
          border: '1px solid rgba(0, 0, 0, 0.03)',
        }}
      >
        {/* BRAND LOGO HEADER */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            marginBottom: '28px',
          }}
        >
          <Snai3iIcon className="w-8 h-8 shrink-0" fill="#F2A807" />
          <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
            <span
              style={{
                color: '#F2A807',
                fontWeight: '900',
                fontSize: '11px',
                letterSpacing: '0.2em',
                lineHeight: 1.1,
              }}
            >
              SNAI3I
            </span>
            <span
              style={{
                color: '#F2A807',
                fontWeight: '700',
                fontSize: '11px',
                lineHeight: 1.1,
                marginTop: '1px',
              }}
            >
              صنايعي
            </span>
          </div>
          <div
            style={{
              width: '1px',
              height: '24px',
              background: '#e2e8f0',
              margin: '0 4px',
            }}
          />
          <span
            style={{
              color: '#1a202c',
              fontWeight: '900',
              fontSize: '16px',
              letterSpacing: '-0.3px',
            }}
          >
            Points Tracker
          </span>
        </div>

        {/* HEADING & SUBTITLE */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h1
            style={{
              fontSize: '23px',
              fontWeight: '900',
              color: '#1a202c',
              margin: '0 0 6px',
              letterSpacing: '-0.3px',
            }}
          >
            Sign in to Point Keeper
          </h1>
          <p
            style={{
              fontSize: '13px',
              color: '#718096',
              margin: 0,
              fontWeight: '500',
            }}
          >
            Welcome back! Please sign in to continue
          </p>
        </div>

        {/* DIVIDER */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '22px 0 24px',
          }}
        >
          <div
            style={{
              position: 'absolute',
              width: '100%',
              borderTop: '1px solid #e2e8f0',
            }}
          />
          <span
            style={{
              position: 'relative',
              background: '#ffffff',
              padding: '0 12px',
              fontSize: '12.5px',
              color: '#718096',
              fontWeight: '500',
              zIndex: 1,
            }}
          >
            sign in with email
          </span>
        </div>

        {/* FORM */}
        <form onSubmit={handleSubmit}>
          {/* EMAIL */}
          <div style={{ marginBottom: '18px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: '800',
                color: '#1a202c',
                marginBottom: '8px',
              }}
            >
              Email address
            </label>
            <input
              type="email"
              placeholder="snai3i@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: '100%',
                padding: '13px 16px',
                background: '#EEF4FF',
                border: '1px solid transparent',
                borderRadius: '10px',
                fontSize: '13.5px',
                fontWeight: '600',
                color: '#1a202c',
                outline: 'none',
                fontFamily: "'Montserrat', sans-serif",
                boxSizing: 'border-box',
                transition: 'border 0.2s, background 0.2s',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#F2A807')}
              onBlur={(e) => (e.target.style.borderColor = 'transparent')}
            />
          </div>

          {/* PASSWORD */}
          <div style={{ marginBottom: '22px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: '800',
                color: '#1a202c',
                marginBottom: '8px',
              }}
            >
              Password
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '13px 44px 13px 16px',
                  background: '#EEF4FF',
                  border: '1px solid transparent',
                  borderRadius: '10px',
                  fontSize: '13.5px',
                  fontWeight: '600',
                  color: '#1a202c',
                  outline: 'none',
                  fontFamily: "'Montserrat', sans-serif",
                  boxSizing: 'border-box',
                  transition: 'border 0.2s, background 0.2s',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#F2A807')}
                onBlur={(e) => (e.target.style.borderColor = 'transparent')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  background: 'none',
                  border: 'none',
                  color: '#718096',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff style={{ width: '18px', height: '18px' }} />
                ) : (
                  <Eye style={{ width: '18px', height: '18px' }} />
                )}
              </button>
            </div>
          </div>

          {error && (
            <div
              style={{
                padding: '10px 14px',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#dc2626',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '16px',
              }}
            >
              <AlertCircle style={{ width: '15px', height: '15px', flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* SIGN IN BUTTON */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '999px',
              background: loading ? '#f3ba42' : '#F2A807',
              color: '#ffffff',
              fontSize: '15px',
              fontWeight: '900',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 8px 24px rgba(242, 168, 7, 0.38)',
              transition: 'transform 0.15s, background 0.15s',
              fontFamily: "'Montserrat', sans-serif",
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
            onMouseDown={(e) => {
              if (!loading) e.currentTarget.style.transform = 'scale(0.98)';
            }}
            onMouseUp={(e) => {
              if (!loading) e.currentTarget.style.transform = 'scale(1)';
            }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.background = '#e59d04';
            }}
            onMouseLeave={(e) => {
              if (!loading) e.currentTarget.style.background = '#F2A807';
            }}
          >
            {loading ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                <span>Signing in...</span>
              </>
            ) : (
              <span>Sign In</span>
            )}
          </button>
        </form>

        {/* FOOTER */}
        <p
          style={{
            fontSize: '12.5px',
            color: '#718096',
            textAlign: 'center',
            marginTop: '26px',
            marginBottom: '0px',
            fontWeight: '500',
          }}
        >
          Contact your admin if you need access.
        </p>
      </div>
    </div>
  );
};
