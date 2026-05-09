const API_BASE =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? '' : 'http://localhost:4000');

async function request(path, options = {}) {
  const token = localStorage.getItem('sbu_token');
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    },
    ...options
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    throw new Error(payload?.message || 'Request failed');
  }

  return payload;
}

export function apiGet(path, options = {}) {
  return request(path, { method: 'GET', ...options });
}

export function apiPost(path, body, options = {}) {
  return request(path, {
    method: 'POST',
    body: body instanceof FormData ? body : JSON.stringify(body),
    ...options
  });
}

export function apiPatch(path, body, options = {}) {
  return request(path, {
    method: 'PATCH',
    body: body instanceof FormData ? body : JSON.stringify(body),
    ...options
  });
}

export function apiDelete(path, options = {}) {
  return request(path, { method: 'DELETE', ...options });
}

export async function downloadAuthorizedFile(path, filename) {
  const token = localStorage.getItem('sbu_token');
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  if (!response.ok) {
    let message = 'Download failed';
    try {
      const err = await response.json();
      message = err.message || message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

const api = { API_BASE, apiGet, apiPost, apiPatch, apiDelete, downloadAuthorizedFile };

export default api;
