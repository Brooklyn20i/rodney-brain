import React, { useState } from 'react';
import { useCadence } from '../lib/store';

export function Login() {
  const { configured, signInWithPassword } = useCadence();
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (!configured) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr('');
    const { error } = await signInWithPassword('rbalech@gmail.com', password);
    setBusy(false);
    if (error) setErr('Wrong password');
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Cadence</h1>
        <form onSubmit={submit}>
          <div className="form-group">
            <label className="field">Password</label>
            <input type="password" required value={password} placeholder="••••••"
              autoFocus onChange={(e) => setPassword(e.target.value)} />
          </div>
          {err && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{err}</p>}
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
            {busy ? '…' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  );
}
