// Accounts server address and login.
// Online: set REACT_APP_API_URL (e.g. on Vercel) to the Render server address.
export const API_URL = (process.env.REACT_APP_API_URL || 'http://localhost:5000').replace(/\/+$/, '');

// The login is kept in this browser until "Log Out".
const LOGIN_KEY = 'shopaccountLogin';

// Khurram Studio website/admin: same login. Switching between the two apps
// always asks for it again: the app you leave forgets it, and the app you open
// from the other one asks for it.
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

// Came here from the website/admin: ask for the login again
const cameFromWebsite = () => {
  try {
    return new URL(document.referrer).origin === WEBSITE_ORIGIN;
  } catch (error) {
    return false;
  }
};
if (cameFromWebsite()) saveLogin(null);

let onLoggedOut = () => {};
export const setLoggedOutHandler = (fn) => {
  onLoggedOut = fn;
};

// Website tabs opened from here (they are told about a log out too)
const openedTabs = [];
// Going to the website/admin logs this app out, so coming back asks again
export const openWebsite = (url) => {
  const tab = window.open(url, '_blank');
  if (tab) openedTabs.push(tab);
  saveLogin(null);
  onLoggedOut();
};

// "Log Out": forget the login here, and log out the connected website tabs too
export const logOutEverywhere = () => {
  saveLogin(null);
  [window.opener, ...openedTabs].forEach((tab) => {
    try {
      if (tab && !tab.closed) tab.postMessage({ type: 'ks-logout' }, WEBSITE_ORIGIN);
    } catch (error) {
      // tab gone or on another site
    }
  });
};

// The website (in a tab this app opened, or that opened this one) says it
// logged out: listen only to that exact site.
window.addEventListener('message', (event) => {
  if (event.origin !== WEBSITE_ORIGIN || event.data?.type !== 'ks-logout') return;
  saveLogin(null);
  onLoggedOut();
});

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
