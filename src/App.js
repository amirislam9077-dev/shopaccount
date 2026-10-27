import React, { useEffect, useState } from 'react';
import MainMenu from './component/mainmenu';
import { API_URL, apiFetch, askOpenerForLogin, loggedInByHand, readLogin, saveLogin, setLoggedOutHandler } from './api';
import PasswordScreen from './password';
import './login.css';

// The accounts app opens only after logging in with the admin email + password.
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [passwordMode, setPasswordMode] = useState(''); // '' | 'change' | 'forgot'

  // The free online server sleeps when idle; start waking it right away
  useEffect(() => {
    fetch(`${API_URL}/`).catch(() => {});
  }, []);

  // Opened from the website admin: use its login instead of asking again
  useEffect(() => askOpenerForLogin((login) => {
    saveLogin(login);
    onLogin(login);
  }), [onLogin]);

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
        loggedInByHand();
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

  if (passwordMode) {
    return (
      <div className="sa-login">
        <PasswordScreen
          mode={passwordMode}
          initialEmail={email}
          onBack={() => setPasswordMode('')}
          onChanged={(login) => {
            // log straight in with the new password
            saveLogin(login);
            loggedInByHand();
            onLogin(login);
          }}
        />
      </div>
    );
  }

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
        <input type="text" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        {error && <p className="sa-login-error">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
        <div className="sa-login-links">
          <button type="button" className="sa-login-link" onClick={() => setPasswordMode('forgot')}>Forgot password?</button>
          <button type="button" className="sa-login-link" onClick={() => setPasswordMode('change')}>Change password</button>
        </div>
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
