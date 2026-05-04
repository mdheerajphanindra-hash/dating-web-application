const API_URL = import.meta.env.VITE_API_URL?.trim();

let resolvedApiUrl = API_URL || '';

function getApiCandidates() {
  const candidates = [];
  const host = typeof window !== 'undefined' ? window.location.hostname || '127.0.0.1' : '127.0.0.1';

  if (resolvedApiUrl) {
    candidates.push(resolvedApiUrl);
  }

  if (API_URL && !candidates.includes(API_URL)) {
    candidates.push(API_URL);
  }

  for (const candidate of [
    'http://127.0.0.1:5000',
    'http://127.0.0.1:5001',
    `http://${host}:5000`,
    `http://${host}:5001`
  ]) {
    if (!candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

async function apiFetch(path, { method = 'GET', body, token } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
  const requestOptions = {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {})
  };
  const candidates = getApiCandidates();
  let lastNetworkError = null;

  for (const baseUrl of candidates) {
    try {
      const response = await fetch(`${baseUrl}${path}`, requestOptions);
      const data = await response.json().catch(() => ({}));
      resolvedApiUrl = baseUrl;

      if (!response.ok) {
        const error = new Error(data.message || 'Request failed.');
        error.status = response.status;
        error.data = data;
        throw error;
      }

      return data;
    } catch (error) {
      if (error instanceof TypeError) {
        lastNetworkError = error;
        continue;
      }
      throw error;
    }
  }

  const error = new Error(
    'Cannot reach the backend server. Make sure the API is running on localhost:5000 or localhost:5001.'
  );
  error.cause = lastNetworkError;
  throw error;
}

function getSocketUrl() {
  return resolvedApiUrl || getApiCandidates()[0];
}

function connectToProfile(token, userId, profilePreview = null) {
  return apiFetch('/api/matches/connect', {
    method: 'POST',
    token,
    body: { userId, profilePreview }
  });
}

function updateMatchStar(token, matchId, starred) {
  return apiFetch(`/api/matches/${matchId}/star`, {
    method: 'PATCH',
    token,
    body: { starred }
  });
}

export {
  apiFetch,
  connectToProfile,
  getApiCandidates,
  getSocketUrl,
  updateMatchStar
};
