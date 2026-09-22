const USER_AGENT_HINT = 'web';

function buildHeaders(settings, { withAuth = true, json = false } = {}) {
  const headers = {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US',
    'X-Evc-Network-Id': settings.networkId,
    'X-Platform': USER_AGENT_HINT,
    'mobile-app-version': settings.appVersion,
  };
  if (json) headers['Content-Type'] = 'application/json;charset=UTF-8';
  if (withAuth && settings.apiToken) headers['EVC-API-TOKEN'] = settings.apiToken;
  return headers;
}

async function send(settings, { path, method = 'GET', body, withAuth = true }) {
  const url = new URL(path, settings.baseUrl).toString();
  const response = await fetch(url, {
    method,
    headers: buildHeaders(settings, { withAuth, json: Boolean(body) }),
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'omit',
  });

  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  if (response.status === 401 || response.status === 403) {
    const error = new Error(parsed?.message || (withAuth ? 'Session expired. Sign in again.' : 'Sign in was rejected.'));
    error.messageKey = parsed?.messageKey;
    // Only token-bearing calls should trigger the refresh-and-retry path.
    error.unauthorized = withAuth;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(parsed?.message || `HTTP ${response.status}`);
    error.messageKey = parsed?.messageKey;
    if (parsed?.messageKey === 'refresh-token-invalid') error.refreshTokenInvalid = true;
    throw error;
  }
  if (parsed === null) throw new Error('Unexpected non-JSON response.');
  return parsed;
}

export function decodeJwt(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

export function expiresAt(token) {
  const exp = decodeJwt(token)?.exp;
  return typeof exp === 'number' ? exp * 1000 : null;
}

function extractTokens(data, context) {
  const result = {};
  const visit = (node) => {
    if (typeof node === 'string') {
      const claims = decodeJwt(node);
      if (!claims) return;
      // The access token carries userRole; the refresh token carries createdTimeMillis.
      if (claims.userRole || claims.refreshTokenInfoId) result.apiToken = node;
      else if (claims.createdTimeMillis) result.refreshToken = node;
      return;
    }
    if (node && typeof node === 'object') Object.values(node).forEach(visit);
  };
  visit(data);

  if (!result.apiToken) throw new Error(`${context} succeeded but no token was returned.`);
  return result;
}

export async function login(settings, email, password) {
  if (!email || !password) throw new Error('Enter your email and password first.');
  const data = await send(settings, {
    path: settings.authPath,
    method: 'POST',
    body: { email, password, networkId: settings.networkId },
    withAuth: false,
  });
  return extractTokens(data, 'Sign in');
}

// Refresh tokens are single-use: the server rotates them, so the pair returned
// here must be persisted before the next request.
export async function refreshSession(settings) {
  if (!settings.refreshToken) throw new Error('Not signed in.');
  const data = await send(settings, {
    path: settings.authPath,
    method: 'PUT',
    body: { token: settings.refreshToken },
    withAuth: false,
  });
  return extractTokens(data, 'Refresh');
}

export async function fetchLocations(settings) {
  if (!settings.apiToken && !settings.refreshToken) throw new Error('Not signed in.');
  return send(settings, { path: settings.locationsPath });
}
