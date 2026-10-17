// Accounts server address and login.
// Online: set REACT_APP_API_URL (e.g. on Vercel) to the Render server address.
export const API_URL = (process.env.REACT_APP_API_URL || 'http://localhost:5000').replace(/\/+$/, '');

// The login is kept in this browser until "Log Out", so it is asked only once.
const LOGIN_KEY = 'shopaccountLogin';

// Khurram Studio website/admin: same login. A tab opened from one app asks the
// app that opened it, so it opens directly without asking again.
export const WEBSITE_URL = 'https://kstu-delta.vercel.app';
const WEBSITE_ORIGIN = new URL(WEBSITE_URL).origin;

const clean = (value) => (value && value.email && value.password ? { email: value.email, password: value.password } : null);

export const readLogin = () => {
  try {
    const saved = window.localStorage.getItem(LOGIN_KEY) || window.sessionStorage.getItem(LOGIN_KEY);
    return clean(JSON.parse(saved || 'null'));
  } catch (error) {
    return null;
  }
};

export const saveLogin = (login) => {
  try {
    window.sessionStorage.removeItem(LOGIN_KEY); // older versions kept it per tab
    if (login) window.localStorage.setItem(LOGIN_KEY, JSON.stringify(clean(login)));
    else window.localStorage.removeItem(LOGIN_KEY);
  } catch (error) {
    // storage blocked: the login lasts until the page is closed
  }
};

// The website (in a tab this app opened, or that opened this one) asks for the
// login: answer only that exact site, and only when logged in here.
window.addEventListener('message', (event) => {
  if (event.origin !== WEBSITE_ORIGIN || !event.source || event.data?.type !== 'ks-login-request') return;
  const login = readLogin();
  if (login) event.source.postMessage({ type: 'ks-login', ...login }, event.origin);
});

// Not logged in here: ask the website tab that opened this one.
// Calls onLogin(login) if it answers; returns a cleanup function.
// Used once per page load, so a wrong login shows the login form instead of looping.
let askedOpener = false;
export const askOpenerForLogin = (onLogin) => {
  if (askedOpener || !window.opener) return () => {};
  const listener = (event) => {
    if (event.origin !== WEBSITE_ORIGIN || event.data?.type !== 'ks-login') return;
    const login = clean(event.data);
    if (!login || askedOpener) return;
    askedOpener = true;
    onLogin(login);
  };
  window.addEventListener('message', listener);
  try {
    window.opener.postMessage({ type: 'ks-login-request' }, WEBSITE_ORIGIN);
  } catch (error) {
    // opener gone
  }
  return () => window.removeEventListener('message', listener);
};

let onLoggedOut = () => {};
export const setLoggedOutHandler = (fn) => {
  onLoggedOut = fn;
};

// fetch() that sends the login with every request to the accounts server
export const apiFetch = async (url, options = {}, login = readLogin()) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'x-admin-email': login?.email || '',
      'x-admin-key': login?.password || ''
    }
  });
  if (response.status === 401) {
    saveLogin(null);
    onLoggedOut();
  }
  return response;
};
