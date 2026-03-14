/**
 * API helper — wraps fetch with JWT auth and a 120-second timeout.
 * Minting NFTs on XRPL can take up to ~30 seconds; the timeout prevents
 * the browser from hanging indefinitely if the server drops the connection.
 */

const BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

export async function api(endpoint, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000);
  opts.signal = controller.signal;

  try {
    const res = await fetch(`${BASE}${endpoint}`, opts);
    const data = await res.json();
    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'Request timed out. The XRPL transaction may still be processing — check back in a moment.' };
    }
    return { success: false, error: err.message };
  } finally {
    clearTimeout(timeoutId);
  }
}

export function setToken(token) {
  localStorage.setItem('token', token);
}

export function clearToken() {
  localStorage.removeItem('token');
}
