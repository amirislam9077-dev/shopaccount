import React, { useState } from 'react';

// "Change password" and "Forgot password" for the accounts login screen.
// The password is shared with the Khurram Studio admin, so this uses the
// website server, which keeps it (the accounts server reads the same one).
export const PASSWORD_API = (process.env.REACT_APP_PASSWORD_API || 'https://backend-2-q4lr.onrender.com').replace(/\/+$/, '');

const post = async (path, body) => {
  let response;
  try {
    response = await fetch(`${PASSWORD_API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (err) {
    throw new Error('The server is not responding. It may be waking up — please wait a minute and try again.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Request failed (${response.status}).`);
  return data;
};

function PasswordScreen({ mode, initialEmail = '', onBack, onChanged }) {
  const [email, setEmail] = useState(initialEmail);
  const [currentPassword, setCurrentPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const run = async (task) => {
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const checkNew = () => {
    if (newPassword.length < 6) throw new Error('The new password must be at least 6 characters.');
    if (newPassword !== confirmPassword) throw new Error('The two new passwords are not the same.');
  };

  const changePassword = (event) => {
    event.preventDefault();
    run(async () => {
      if (!email.trim() || !currentPassword) throw new Error('Enter your email and current password.');
      checkNew();
      await post('/admin/password/change', { email: email.trim(), currentPassword, newPassword });
      onChanged({ email: email.trim(), password: newPassword });
    });
  };

  const sendCode = (event) => {
    event.preventDefault();
    run(async () => {
      if (!email.trim()) throw new Error('Enter the admin email.');
      const data = await post('/admin/password/forgot', { email: email.trim() });
      setCodeSent(true);
      setNote(data.message);
    });
  };

  const resetPassword = (event) => {
    event.preventDefault();
    run(async () => {
      if (!/^\d{6}$/.test(code.trim())) throw new Error('Enter the 6-digit code from the email.');
      checkNew();
      await post('/admin/password/reset', { email: email.trim(), code: code.trim(), newPassword });
      onChanged({ email: email.trim(), password: newPassword });
    });
  };

  const brand = (title, text) => (
    <>
      <div className="sa-login-brand">
        <span className="sa-login-logo">KS</span>
        <div>
          <strong>Khurram Studio</strong>
          <span>{title}</span>
        </div>
      </div>
      {text && <p>{text}</p>}
    </>
  );

  const newPasswordFields = (
    <>
      <input type="password" placeholder="New password (at least 6 characters)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
      <input type="password" placeholder="New password again" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
    </>
  );

  const footer = (label) => (
    <>
      {error && <p className="sa-login-error">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? 'Please wait…' : label}</button>
      <button type="button" className="sa-login-link" onClick={onBack}>← Back to log in</button>
    </>
  );

  if (mode === 'change') {
    return (
      <form className="sa-login-card" onSubmit={changePassword}>
        {brand('Change Password', 'The new password also opens the Khurram Studio admin.')}
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        <input type="password" placeholder="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
        {newPasswordFields}
        {footer('Change password')}
      </form>
    );
  }

  if (!codeSent) {
    return (
      <form className="sa-login-card" onSubmit={sendCode}>
        {brand('Forgot Password', 'Enter the admin email. A 6-digit code will be emailed to it.')}
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus />
        {footer('Send code')}
      </form>
    );
  }

  return (
    <form className="sa-login-card" onSubmit={resetPassword}>
      {brand('New Password')}
      {note && <p className="sa-login-note">{note}</p>}
      <input type="text" inputMode="numeric" maxLength={6} placeholder="6-digit code from the email" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoComplete="one-time-code" autoFocus />
      {newPasswordFields}
      {footer('Save new password')}
      <button type="button" className="sa-login-link" disabled={busy} onClick={sendCode}>Send the code again</button>
    </form>
  );
}

export default PasswordScreen;
