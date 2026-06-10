import React, { useState } from 'react';
import { useCadence } from '../lib/store';

export function Login() {
  const { configured, signIn } = useCadence();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (!configured) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <h1>Cadence</h1>
          <p>This build isn't connected to its backend yet. Add your Supabase
            <code> URL</code> and <code>anon key</code> (see <code>web/.env.example</code>),
            rebuild, and you'll get a login here.</p>
        </div>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr('');
    const { error } = await signIn(email.trim());
    setBusy(false);
    if (error) setErr(error); else setSent(true);
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Cadence</h1>
        {sent ? (
          <p>Check your email — we sent a sign-in link to <strong>{email}</strong>.
            Open it on this device to continue.</p>
        ) : (
          <>
            <p>Sign in to your executive cockpit. We'll email you a one-tap link — no password.</p>
            <form onSubmit={submit}>
              <div className="form-group">
                <label className="field">Email</label>
                <input type="email" required value={email} placeholder="you@example.com"
                  onChange={(e) => setEmail(e.target.value)} autoFocus />
              </div>
              {err && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{err}</p>}
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
                {busy ? 'Sending…' : 'Email me a sign-in link'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
