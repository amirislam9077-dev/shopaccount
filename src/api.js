// Accounts server address and login.
// Online: set REACT_APP_API_URL (e.g. on Vercel) to the Render server address.
export const API_URL = (process.env.REACT_APP_API_URL || 'http://localhost:5000').replace(/\/+$/, '');

const LOGIN_KEY = 'shopaccountLogin';

export const readLogin = () => {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(LOGIN_KEY) || 'null');
    return saved && saved.email && saved.password ? saved : null;
  } catch (error) {
    return null;
  }
};

export const saveLogin = (login) => {
  try {
    if (login) window.sessionStorage.setItem(LOGIN_KEY, JSON.stringify(login));
    else window.sessionStorage.removeItem(LOGIN_KEY);
  } catch (error) {
    // storage blocked: the login lasts until the page is closed
  }
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
