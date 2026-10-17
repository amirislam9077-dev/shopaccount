import React, { useEffect, useState } from 'react';
import MainMenu from './component/mainmenu';
import { API_URL, apiFetch, readLogin, saveLogin, setLoggedOutHandler } from './api';
import './login.css';

// The accounts app opens only after logging in with the admin email + password.
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // The free online server sleeps when idle; start waking it right away
  useEffect(() => {
    fetch(`${API_URL}/`).catch(() => {});
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    const login = { email: email.trim(), password };
    if (!login.email || !login.password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch(`${API_URL}/api/login`, {}, login);
      if (res.ok) {
        saveLogin(login);
        onLogin(login);
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Wrong email or password.');
      }
    } catch (err) {
      setError('The server is not responding. It may be waking up — please wait a minute and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sa-login">
      <form className="sa-login-card" onSubmit={submit}>
        <div className="sa-login-brand">
          <span className="sa-login-logo">KS</span>
          <div>
            <strong>Khurram Studio</strong>
            <span>Accounts</span>
          </div>
        </div>
        <p>Log in to open the accounts.</p>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        {error && <p className="sa-login-error">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      </form>
    </div>
  );
}

function App() {
  const [login, setLogin] = useState(readLogin);

  useEffect(() => {
    setLoggedOutHandler(() => setLogin(null));
  }, []);

  if (!login) {
    return <LoginScreen onLogin={setLogin} />;
  }
  return <MainMenu />;
}

export default App;
