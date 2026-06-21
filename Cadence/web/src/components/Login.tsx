import React, { useEffect, useState } from 'react';
import { useCadence } from '../lib/store';

type Step = 'login' | 'reset_sent';
const LAST_EMAIL_KEY = 'cadence:last-email';

export function Login({ inviteHint }: { inviteHint?: boolean }) {
  const { configured, signIn, resetPassword } = useCadence();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<Step>('login');
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEmail(localStorage.getItem(LAST_EMAIL_KEY) || '');
  }, []);

  if (!configured) return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Cadence</h1>
        <p>Not connected to backend. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env</code> and rebuild.</p>
      </div>
    </div>
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) return;
    setBusy(true); setErr(''); setNotice('');
    const { error } = await signIn(cleanEmail, password);
    setBusy(false);
    if (error) setErr('Incorrect email or password.');
    else localStorage.setItem(LAST_EMAIL_KEY, cleanEmail);
  };

  const sendReset = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) { setErr('Enter your email first.'); return; }
    setBusy(true); setErr(''); setNotice('');
    const { error } = await resetPassword(cleanEmail);
    setBusy(false);
    if (error) setErr(error);
    else { localStorage.setItem(LAST_EMAIL_KEY, cleanEmail); setStep('reset_sent'); }
  };

  if (step === 'reset_sent') return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Cadence</h1>
        <p>Password reset email sent to <strong>{email}</strong>. Open the link in the same browser, set your password, then come back and sign in.</p>
        <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
          onClick={() => { setStep('login'); setErr(''); }}>
          Back to sign in
        </button>
      </div>
    </div>
  );

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Cadence</h1>
        {inviteHint
          ? <p>Sign in (or create an account) to accept your team invite.</p>
          : <p>Sign in to your executive cockpit.</p>
        }
        <form onSubmit={submit}>
          <div className="form-group">
            <label className="field">Email</label>
            <input type="email" required value={email} placeholder="you@example.com"
              autoComplete="email" autoFocus onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="field">Password</label>
            <input type="password" required value={password} placeholder="••••••"
              autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} />
          </div>
          {err && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{err}</p>}
          {notice && <p style={{ color: 'var(--green)', fontSize: 13, marginBottom: 12 }}>{notice}</p>}
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <button type="button" className="btn btn-ghost" onClick={sendReset} disabled={busy}
          style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}>
          Forgot password?
        </button>
      </div>
    </div>
  );
}
