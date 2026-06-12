import { useState } from 'react';
import { api, setToken } from '../api';

export default function AuthScreen({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api<{ token: string }>(`/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setToken(r.token);
      onAuthed();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>daylog</h1>
        <p className="tagline">Know where your 24 hours go.</p>
        <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <input
            type="email" placeholder="email" value={email} autoFocus
            onChange={e => setEmail(e.target.value)} autoComplete="email"
          />
          <input
            type="password" placeholder={mode === 'register' ? 'password (8+ characters)' : 'password'}
            value={password} onChange={e => setPassword(e.target.value)}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          />
          <div className="form-error">{error}</div>
          <button className="primary" type="submit" disabled={busy || !email || password.length < 8}>
            {mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>
        <div className="auth-toggle">
          {mode === 'login' ? (
            <>New here? <a onClick={() => { setMode('register'); setError(''); }}>Create an account</a></>
          ) : (
            <>Have an account? <a onClick={() => { setMode('login'); setError(''); }}>Log in</a></>
          )}
        </div>
      </div>
    </div>
  );
}
