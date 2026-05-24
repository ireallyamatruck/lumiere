'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';

interface Props {
  onClose: () => void;
}

export default function AuthModal({ onClose }: Props) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    if (mode === 'signin') {
      const { error } = await signIn(email, password);
      if (error) setError(error);
      else onClose();
    } else {
      if (username.length < 3) { setError('Username must be at least 3 characters'); setLoading(false); return; }
      const { error } = await signUp(email, password, username);
      if (error) setError(error);
      else setDone(true);
    }
    setLoading(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.88)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-sm animate-fade-up"
        style={{ background: '#0d0d0d', border: '1px solid #1e1e1e', borderRadius: '6px', padding: '32px', opacity: 0 }}
      >
        {done ? (
          <div className="text-center">
            <div className="font-display text-[22px] font-light text-[#e2d9c8] mb-3" style={{ fontFamily: 'var(--font-display)' }}>
              check your email
            </div>
            <p className="text-[11px] text-neutral-500 tracking-wide leading-relaxed">
              we sent a confirmation link to {email}.<br />click it to activate your account.
            </p>
            <button onClick={onClose} className="mt-6 text-[10px] tracking-[0.2em] uppercase text-neutral-600 hover:text-[#e2d9c8] transition-colors">
              close
            </button>
          </div>
        ) : (
          <>
            <div className="font-display text-[26px] font-light text-[#e2d9c8] mb-6" style={{ fontFamily: 'var(--font-display)' }}>
              {mode === 'signin' ? 'sign in' : 'create account'}
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {mode === 'signup' && (
                <div>
                  <label className="text-[9px] tracking-[0.2em] uppercase text-neutral-600 block mb-1">username</label>
                  <input
                    value={username}
                    onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    className="w-full bg-transparent border-b border-[#222] text-[#e2d9c8] font-mono text-[12px] py-2 outline-none focus:border-neutral-600 transition-colors"
                    placeholder="yourname"
                    required
                  />
                </div>
              )}
              <div>
                <label className="text-[9px] tracking-[0.2em] uppercase text-neutral-600 block mb-1">email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-transparent border-b border-[#222] text-[#e2d9c8] font-mono text-[12px] py-2 outline-none focus:border-neutral-600 transition-colors"
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div>
                <label className="text-[9px] tracking-[0.2em] uppercase text-neutral-600 block mb-1">password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-transparent border-b border-[#222] text-[#e2d9c8] font-mono text-[12px] py-2 outline-none focus:border-neutral-600 transition-colors"
                  placeholder="········"
                  required
                  minLength={6}
                />
              </div>

              {error && <div className="text-[10px] text-red-700 tracking-wide">{error}</div>}

              <button
                type="submit"
                disabled={loading}
                className="mt-2 py-2 text-[10px] tracking-[0.2em] uppercase border border-[#333] text-[#e2d9c8] rounded-sm hover:border-neutral-500 transition-all duration-200 disabled:opacity-40"
              >
                {loading ? '...' : mode === 'signin' ? 'sign in' : 'create account'}
              </button>
            </form>

            <div className="mt-5 text-center">
              <button
                onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError(''); }}
                className="text-[10px] tracking-[0.15em] text-neutral-600 hover:text-neutral-400 transition-colors"
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
