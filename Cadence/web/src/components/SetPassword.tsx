import React, { useState } from 'react';
import { useCadence } from '../lib/store';

export function SetPassword() {
  const { setPassword } = useCadence();
  const [password, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setErr('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setErr('Passwords do not match.'); return; }
    setBusy(true); setErr('');
    const { error } = await setPassword(password);
    setBusy(false);
    if (error) setErr(error);
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Cadence</h1>
        <p>Set your password to finish signing in.</p>
        <form onSubmit={submit}>
          <div className="form-group">
            <label className="field">New password</label>
            <input type="password" required value={password} placeholder="At least 8 characters"
              autoFocus onChange={(e) => setPass(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="field">Confirm password</label>
            <input type="password" required value={confirm} placeholder="Same again"
              onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {err && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{err}</p>}
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
            {busy ? 'Setting password…' : 'Set password & sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
