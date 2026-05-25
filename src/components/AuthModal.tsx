'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

interface Props {
  onClose: () => void;
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function validateUsername(username: string): string | null {
  if (username.length < 3) return 'at least 3 characters';
  if (username.length > 20) return 'max 20 characters';
  if (!/^[a-z0-9_]+$/.test(username)) return 'only letters, numbers, underscores';
  return null;
}

export default function AuthModal({ onClose }: Props) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');

  const [emailError, setEmailError] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameOk, setUsernameOk] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const usernameTimer = useRef<NodeJS.Timeout>();

  // Real-time username availability check
  useEffect(() => {
    setUsernameOk(false);
    setUsernameError('');
    if (!username) return;

    const localErr = validateUsername(username);
    if (localErr) { setUsernameError(localErr); return; }

    setCheckingUsername(true);
    clearTimeout(usernameTimer.current);
    usernameTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username)
        .maybeSingle();
      setCheckingUsername(false);
      if (data) {
        setUsernameError('username already taken');
        setUsernameOk(false);
      } else {
        setUsernameError('');
        setUsernameOk(true);
      }
    }, 500);
  }, [username]);

  const handleEmailBlur = () => {
    if (email && !validateEmail(email)) {
      setEmailError('enter a valid email address');
    } else {
      setEmailError('');
    }
  };

  const canSubmit = () => {
    if (!email || !password) return false;
    if (!validateEmail(email)) return false;
    if (mode === 'signup') {
      if (!usernameOk || checkingUsername) return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!validateEmail(email)) { setEmailError('enter a valid email address'); return; }
    if (mode === 'signup' && !usernameOk) return;

    setLoading(true);
    try {
      if (mode === 'signin') {
        const { error } = await signIn(email, password);
        if (error) {
          setFormError(error.includes('Invalid') ? 'incorrect email or password' : error);
        } else {
          onClose();
        }
      } else {
        const { error } = await signUp(email, password, username);
        if (error) setFormError(error);
        else setDone(true);
      }
    } catch (e: any) {
      setFormError(e?.message || 'Something went wrong. Please try again.');
    }
    setLoading(false);
  };

  const inputStyle = (hasError: boolean, hasSuccess = false) => ({
    width: '100%',
    background: 'transparent',
    borderBottom: `1px solid ${hasError ? '#8B2020' : hasSuccess ? '#2a6b2a' : '#2a2a2a'}`,
    color: '#f0ebe0',
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    padding: '8px 0',
    outline: 'none',
    transition: 'border-color 0.2s',
  });

  const labelStyle = {
    fontSize: '10px',
    letterSpacing: '0.2em',
    textTransform: 'uppercase' as const,
    color: '#777',
    display: 'block',
    marginBottom: '4px',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.9)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-sm animate-fade-up"
        style={{ background: '#0d0d0d', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '36px', opacity: 0 }}
      >
        {done ? (
          <div className="text-center">
            <div className="font-display font-light mb-4" style={{ fontFamily: 'var(--font-display)', fontSize: '26px', color: '#f0ebe0' }}>
              check your email
            </div>
            <p style={{ fontSize: '13px', color: '#888', lineHeight: '1.7' }}>
              we sent a confirmation link to<br />
              <span style={{ color: '#ccc' }}>{email}</span>
            </p>
            <button onClick={onClose} style={{ marginTop: '24px', fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#777', background: 'none', border: 'none', cursor: 'pointer' }}>
              close
            </button>
          </div>
        ) : (
          <>
            <div className="font-display font-light mb-7" style={{ fontFamily: 'var(--font-display)', fontSize: '30px', color: '#f0ebe0' }}>
              {mode === 'signin' ? 'sign in' : 'create account'}
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {mode === 'signup' && (
                <div>
                  <label style={labelStyle}>username</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      value={username}
                      onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                      style={inputStyle(!!usernameError, usernameOk)}
                      placeholder="yourname"
                      autoComplete="off"
                      required
                    />
                    <span style={{ position: 'absolute', right: 0, top: '8px', fontSize: '11px' }}>
                      {checkingUsername && <span style={{ color: '#555' }}>checking...</span>}
                      {!checkingUsername && usernameOk && <span style={{ color: '#4a8b4a' }}>✓ available</span>}
                    </span>
                  </div>
                  {usernameError && (
                    <div style={{ fontSize: '11px', color: '#8B2020', marginTop: '4px' }}>{usernameError}</div>
                  )}
                </div>
              )}

              <div>
                <label style={labelStyle}>email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); if (emailError) setEmailError(''); }}
                  onBlur={handleEmailBlur}
                  style={inputStyle(!!emailError)}
                  placeholder="you@example.com"
                  required
                />
                {emailError && (
                  <div style={{ fontSize: '11px', color: '#8B2020', marginTop: '4px' }}>{emailError}</div>
                )}
              </div>

              <div>
                <label style={labelStyle}>password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  style={inputStyle(false)}
                  placeholder="········"
                  required
                  minLength={6}
                />
                {mode === 'signup' && (
                  <div style={{ fontSize: '10px', color: '#555', marginTop: '4px' }}>minimum 6 characters</div>
                )}
              </div>

              {formError && (
                <div style={{ fontSize: '12px', color: '#8B2020', padding: '8px 12px', border: '1px solid #3a1a1a', borderRadius: '3px', background: '#1a0a0a' }}>
                  {formError}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !canSubmit()}
                style={{
                  marginTop: '4px', padding: '10px', fontSize: '11px', letterSpacing: '0.2em',
                  textTransform: 'uppercase', border: '1px solid #444', color: '#f0ebe0',
                  borderRadius: '4px', background: 'transparent', cursor: canSubmit() ? 'pointer' : 'default',
                  opacity: canSubmit() ? 1 : 0.35, transition: 'all 0.2s',
                }}
                onMouseEnter={e => { if (canSubmit()) e.currentTarget.style.background = '#1a1a1a'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                {loading ? '...' : mode === 'signin' ? 'sign in' : 'create account'}
              </button>
            </form>

            <div style={{ marginTop: '20px', textAlign: 'center' }}>
              <button
                onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setFormError(''); setEmailError(''); setUsernameError(''); setUsernameOk(false); }}
                style={{ fontSize: '11px', color: '#666', background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#aaa')}
                onMouseLeave={e => (e.currentTarget.style.color = '#666')}
              >
                {mode === 'signin' ? "don't have an account? sign up" : 'already have an account? sign in'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
