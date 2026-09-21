export const getApiBase = () => {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('reelix_custom_api_url');
    if (custom && custom.trim()) {
      return custom.trim().replace(/\/$/, '');
    }
  }
  return (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
};

export const setApiBase = (url) => {
  if (typeof window !== 'undefined') {
    if (url && url.trim()) {
      localStorage.setItem('reelix_custom_api_url', url.trim().replace(/\/$/, ''));
    } else {
      localStorage.removeItem('reelix_custom_api_url');
    }
  }
};

export const apiUrl = (path) => {
  if (!path) return '';
  const base = getApiBase();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
};

export const apiFetch = (path, options = {}) => {
  const url = apiUrl(path);
  const headers = {
    'Bypass-Tunnel-Reminder': 'true',
    'ngrok-skip-browser-warning': '1',
    ...(options.headers || {}),
  };
  return fetch(url, { ...options, headers });
};

export const resolveMediaUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }
  return apiUrl(url);
};

export const checkBackendHealth = async (overrideBase = null) => {
  try {
    const base = overrideBase !== null ? (overrideBase || '').replace(/\/$/, '') : getApiBase();
    const url = `${base}/`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Bypass-Tunnel-Reminder': 'true',
        'ngrok-skip-browser-warning': '1',
      },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return { online: true, data };
    }
    return { online: false, status: res.status };
  } catch (err) {
    return { online: false, error: err.message };
  }
};
