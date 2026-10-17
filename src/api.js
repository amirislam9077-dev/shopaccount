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

// After "Log Out" this tab must not log itself back in from the website
const NO_AUTO_LOGIN = 'ksNoAutoLogin';
const setNoAutoLogin = (on) => {
  try {
    if (on) window.sessionStorage.setItem(NO_AUTO_LOGIN, '1');
    else window.sessionStorage.removeItem(NO_AUTO_LOGIN);
  } catch (error) {
    // storage blocked
  }
};
const noAutoLogin = () => {
  try {
    return window.sessionStorage.getItem(NO_AUTO_LOGIN) === '1';
  } catch (error) {
    return false;
  }
};

// Typed in by hand: auto login from the website may be used again later
export const loggedInByHand = () => setNoAutoLogin(false);

// Website tabs opened from here (they are told about a log out too)
const openedTabs = [];
export const openWebsite = (url) => {
  const tab = window.open(url, '_blank');
  if (tab) openedTabs.push(tab);
};

let onLoggedOut = () => {};
export const setLoggedOutHandler = (fn) => {
  onLoggedOut = fn;
};

// "Log Out": forget the login here, and log out the connected website tabs too
export const logOutEverywhere = () => {
  saveLogin(null);
  setNoAutoLogin(true);
  [window.opener, ...openedTabs].forEach((tab) => {
    try {
      if (tab && !tab.closed) tab.postMessage({ type: 'ks-logout' }, WEBSITE_ORIGIN);
    } catch (error) {
      // tab gone or on another site
    }
  });
};

// The website (in a tab this app opened, or that opened this one) asks for the
// login, or says it logged out: listen only to that exact site.
window.addEventListener('message', (event) => {
  if (event.origin !== WEBSITE_ORIGIN || !event.source) return;
  if (event.data?.type === 'ks-logout') {
    saveLogin(null);
    setNoAutoLogin(true);
    onLoggedOut();
    return;
  }
  if (event.data?.type !== 'ks-login-request') return;
  const login = readLogin();
  if (login) event.source.postMessage({ type: 'ks-login', ...login }, event.origin);
});

// Not logged in here: ask the website tab that opened this one.
// Calls onLogin(login) if it answers; returns a cleanup function.
// Used once per page load, so a wrong login shows the login form instead of looping.
let askedOpener = false;
export const askOpenerForLogin = (onLogin) => {
  if (askedOpener || noAutoLogin() || !window.opener) return () => {};
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
