import React, { useEffect, useState } from 'react';
import { useCadenceFinancial } from '../lib/store';

const LAST_EMAIL_KEY = 'cadence-financial:last-email';

export function Login() {
  const { configured, signIn, resetPassword } = useCadenceFinancial();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEmail(localStorage.getItem(LAST_EMAIL_KEY) || '');
  }, []);

  if (!configured) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <h1>Cadence Financial</h1>
          <p>
            Not connected to a backend yet. Create a dedicated Supabase project for Cadence
            Financial, then set <code>VITE_SUPABASE_URL</code> and{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env</code> and rebuild. See{' '}
            <code>CadenceFinancial/AGENTS.md</code> for the full setup checklist.
          </p>
        </div>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) return;
    setBusy(true);
    setErr('');
    const { error } = await signIn(cleanEmail, password);
    setBusy(false);
    if (error) setErr('Incorrect email or password.');
    else localStorage.setItem(LAST_EMAIL_KEY, cleanEmail);
  };

  const sendReset = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setErr('Enter your email first.');
      return;
    }
    setBusy(true);
    setErr('');
    const { error } = await resetPassword(cleanEmail);
    setBusy(false);
    if (error) setErr(error);
    else {
      localStorage.setItem(LAST_EMAIL_KEY, cleanEmail);
      setResetSent(true);
    }
  };

  if (resetSent) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <h1>Cadence Financial</h1>
          <p>
            Password reset email sent to <strong>{email}</strong>. Open the link in the same
            browser, set your password, then come back and sign in.
          </p>
          <button
            className="btn"
            style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
            onClick={() => {
              setResetSent(false);
              setErr('');
            }}
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Cadence Financial</h1>
        <p>Private financial control room. Sign in to continue.</p>
        <form onSubmit={submit}>
          <div className="form-group">
            <label className="field">Email</label>
            <input
              type="email"
              required
              value={email}
              placeholder="you@example.com"
              autoComplete="email"
              autoFocus
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="field">Password</label>
            <input
              type="password"
              required
              value={password}
              placeholder="••••••"
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {err && <p className="form-error">{err}</p>}
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={sendReset}
          disabled={busy}
          style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
        >
          Forgot password?
        </button>
        <p className="login-authority-note">
          Management-grade personal finance tool. It cannot place trades, move money, pay bills,
          refinance loans, or contact third parties on your behalf.
        </p>
      </div>
    </div>
  );
}
