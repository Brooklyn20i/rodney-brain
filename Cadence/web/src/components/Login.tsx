import React, { useState } from 'react';
import { useCadence } from '../lib/store';

const LAST_EMAIL_KEY = 'cadence:last-email';

export function Login() {
  const { configured, signInWithPassword, resetPassword } = useCadence();
  const [email, setEmail] = useState(() => window.localStorage.getItem(LAST_EMAIL_KEY) ?? '');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  if (!configured) {
    return (
      <div className="login-wrap">
        <div className="login-card error-card" role="alert">
          <h1>Cadence</h1>
          <p>
            This build is missing Supabase configuration. Set
            <code> VITE_SUPABASE_URL </code> and
            <code> VITE_SUPABASE_ANON_KEY </code> before deploying.
          </p>
        </div>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    setNotice('');

    const normalizedEmail = email.trim().toLowerCase();
    const { error } = await signInWithPassword(normalizedEmail, password);

    setBusy(false);
    if (error) {
      setErr('Sign-in failed. Check the email and password.');
      return;
    }

    window.localStorage.setItem(LAST_EMAIL_KEY, normalizedEmail);
  };

  const sendReset = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setErr('Enter your email before requesting a reset link.');
      return;
    }

    setResetBusy(true);
    setErr('');
    setNotice('');
    const { error } = await resetPassword(normalizedEmail);
    setResetBusy(false);

    if (error) {
      setErr('Could not send a reset link. Check the email and try again.');
      return;
    }

    window.localStorage.setItem(LAST_EMAIL_KEY, normalizedEmail);
    setNotice('Password reset link sent if the account exists.');
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Cadence</h1>
        <p>Sign in to your executive cockpit.</p>
        <form onSubmit={submit}>
          <div className="form-group">
            <label className="field" htmlFor="cadence-email">Email</label>
            <input
              id="cadence-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              placeholder="you@example.com"
              autoFocus
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="field" htmlFor="cadence-password">Password</label>
            <input
              id="cadence-password"
              type="password"
              required
              value={password}
              placeholder="••••••"
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {err && <p className="form-error">{err}</p>}
          {notice && <p className="form-notice">{notice}</p>}
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
            {busy ? 'Signing in…' : 'Enter'}
          </button>
        </form>
        <button className="btn btn-ghost login-secondary-action" type="button" onClick={sendReset} disabled={resetBusy}>
          {resetBusy ? 'Sending…' : 'Send password reset link'}
        </button>
      </div>
    </div>
  );
}
