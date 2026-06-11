import React, { useState } from 'react';
import { useCadence } from '../lib/store';

export function Login() {
  const { configured, signIn, verifyOtp } = useCadence();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
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

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr('');
    const { error } = await signIn(email.trim());
    setBusy(false);
    if (error) setErr(error); else setStep('code');
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr('');
    const { error } = await verifyOtp(email.trim(), code.trim());
    setBusy(false);
    if (error) setErr(error);
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Cadence</h1>
        {step === 'email' ? (
          <>
            <p>Sign in to your executive cockpit. We'll email you a 6-digit code — no password.</p>
            <form onSubmit={sendCode}>
              <div className="form-group">
                <label className="field">Email</label>
                <input type="email" required value={email} placeholder="you@example.com"
                  onChange={(e) => setEmail(e.target.value)} autoFocus />
              </div>
              {err && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{err}</p>}
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
                {busy ? 'Sending…' : 'Email me a code'}
              </button>
            </form>
          </>
        ) : (
          <>
            <p>Check your email for a 6-digit code sent to <strong>{email}</strong> and enter it below.</p>
            <form onSubmit={verify}>
              <div className="form-group">
                <label className="field">6-digit code</label>
                <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} required
                  value={code} placeholder="123456" autoFocus
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
              </div>
              {err && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{err}</p>}
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy || code.length < 6}>
                {busy ? 'Verifying…' : 'Sign in'}
              </button>
              <button type="button" className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                onClick={() => { setStep('email'); setCode(''); setErr(''); }}>
                Use a different email
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
