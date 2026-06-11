import React, { useState } from 'react';
import { useCadence } from '../lib/store';

type Mode = 'signin' | 'reset_sent';

export function Login() {
  const { configured, signIn, signInWithPassword, resetPassword } = useCadence();
  const [email, setEmail] = useState('rbalech@gmail.com');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<Mode>('signin');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (!configured) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <h1>Cadence</h1>
          <p>Not connected to backend yet. Add Supabase URL + anon key, rebuild.</p>
        </div>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr('');
    const { error } = await signInWithPassword(email.trim(), password);
    setBusy(false);
    if (error) setErr(error);
  };

  const sendReset = async () => {
    setBusy(true); setErr('');
    const { error } = await resetPassword(email.trim());
    setBusy(false);
    if (error) setErr(error); else setMode('reset_sent');
  };

  if (mode === 'reset_sent') {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <h1>Cadence</h1>
          <p>Password reset email sent to <strong>{email}</strong>. Open it in Safari, set your password, then come back here to sign in.</p>
          <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
            onClick={() => setMode('signin')}>Back to sign in</button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Cadence</h1>
        <p>Sign in to your executive cockpit.</p>
        <form onSubmit={submit}>
          <div className="form-group">
            <label className="field">Email</label>
            <input type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="field">Password</label>
            <input type="password" required value={password} placeholder="your password"
              autoFocus onChange={(e) => setPassword(e.target.value)} />
          </div>
          {err && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{err}</p>}
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <button type="button" className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
          disabled={busy} onClick={sendReset}>
          Forgot password / set password
        </button>
      </div>
    </div>
  );
}
