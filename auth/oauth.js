const https = require('https');
const http = require('http');
const { URL, URLSearchParams } = require('url');

/**
 * Helper HTTP/HTTPS JSON client sem dependências externas
 */
function httpRequestJson(targetUrl, { method = 'GET', headers = {}, body = null, timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const lib = parsed.protocol === 'https:' ? https : http;

    const reqOptions = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: `${parsed.pathname}${parsed.search}`,
      method,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'MultiChatStudio/2.0',
        ...headers
      }
    };

    const req = lib.request(reqOptions, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const rawText = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try {
          json = rawText ? JSON.parse(rawText) : {};
        } catch (e) {
          json = { raw: rawText };
        }
        resolve({
          status: res.statusCode || 500,
          ok: (res.statusCode || 500) >= 200 && (res.statusCode || 500) < 300,
          data: json
        });
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('Tempo limite excedido ao comunicar com o provedor OAuth.'));
    });

    req.on('error', (err) => reject(err));

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function getAppBaseUrl(req) {
  if (process.env.APP_URL && process.env.APP_URL.trim()) {
    return process.env.APP_URL.trim().replace(/\/+$/, '');
  }
  if (!req) return 'http://localhost:3333';
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3333';
  return `${proto}://${host}`;
}

function getProviderCredentials(provider, req) {
  const baseUrl = getAppBaseUrl(req);
  const p = String(provider || '').toLowerCase();

  if (p === 'twitch') {
    const clientId = (process.env.TWITCH_CLIENT_ID || '').trim();
    const clientSecret = (process.env.TWITCH_CLIENT_SECRET || '').trim();
    const redirectUri = (process.env.TWITCH_REDIRECT_URI || `${baseUrl}/api/auth/callback/twitch`).trim();
    return {
      provider: 'twitch',
      name: 'Twitch',
      clientId,
      clientSecret,
      redirectUri,
      configured: Boolean(clientId && clientSecret)
    };
  }

  if (p === 'kick') {
    const clientId = (process.env.KICK_CLIENT_ID || '').trim();
    const clientSecret = (process.env.KICK_CLIENT_SECRET || '').trim();
    const redirectUri = (process.env.KICK_REDIRECT_URI || `${baseUrl}/api/auth/callback/kick`).trim();
    return {
      provider: 'kick',
      name: 'Kick',
      clientId,
      clientSecret,
      redirectUri,
      configured: Boolean(clientId && clientSecret)
    };
  }

  if (p === 'google') {
    const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
    const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
    const redirectUri = (process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/api/auth/callback/google`).trim();
    return {
      provider: 'google',
      name: 'Google',
      clientId,
      clientSecret,
      redirectUri,
      configured: Boolean(clientId && clientSecret)
    };
  }

  if (p === 'youtube') {
    // YouTube Live utiliza OAuth 2.0 do Google com escopo youtube.readonly (YouTube Data API v3)
    const clientId = (process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '').trim();
    const clientSecret = (process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '').trim();
    const redirectUri = (process.env.YOUTUBE_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/api/auth/callback/google`).trim();
    return {
      provider: 'youtube',
      name: 'YouTube Live',
      clientId,
      clientSecret,
      redirectUri,
      configured: Boolean(clientId && clientSecret)
    };
  }

  if (p === 'tiktok') {
    // TikTok Login Kit OAuth 2.0: https://developers.tiktok.com/doc/login-kit-web/
    const clientId = (process.env.TIKTOK_CLIENT_KEY || process.env.TIKTOK_CLIENT_ID || '').trim();
    const clientSecret = (process.env.TIKTOK_CLIENT_SECRET || '').trim();
    const redirectUri = (process.env.TIKTOK_REDIRECT_URI || `${baseUrl}/api/auth/callback/tiktok`).trim();
    return {
      provider: 'tiktok',
      name: 'TikTok Live',
      clientId,
      clientSecret,
      redirectUri,
      configured: Boolean(clientId && clientSecret)
    };
  }

  return null;
}

function getProvidersConfigStatus(req) {
  const twitch = getProviderCredentials('twitch', req);
  const kick = getProviderCredentials('kick', req);
  const google = getProviderCredentials('google', req);
  const youtube = getProviderCredentials('youtube', req);
  const tiktok = getProviderCredentials('tiktok', req);

  return {
    twitch: {
      configured: twitch.configured,
      redirectUri: twitch.redirectUri,
      missingVars: [
        !twitch.clientId ? 'TWITCH_CLIENT_ID' : null,
        !twitch.clientSecret ? 'TWITCH_CLIENT_SECRET' : null
      ].filter(Boolean)
    },
    kick: {
      configured: kick.configured,
      redirectUri: kick.redirectUri,
      missingVars: [
        !kick.clientId ? 'KICK_CLIENT_ID' : null,
        !kick.clientSecret ? 'KICK_CLIENT_SECRET' : null
      ].filter(Boolean)
    },
    google: {
      configured: google.configured,
      redirectUri: google.redirectUri,
      missingVars: [
        !google.clientId ? 'GOOGLE_CLIENT_ID' : null,
        !google.clientSecret ? 'GOOGLE_CLIENT_SECRET' : null
      ].filter(Boolean)
    },
    youtube: {
      configured: youtube.configured,
      redirectUri: youtube.redirectUri,
      missingVars: [
        !youtube.clientId ? 'GOOGLE_CLIENT_ID' : null,
        !youtube.clientSecret ? 'GOOGLE_CLIENT_SECRET' : null
      ].filter(Boolean)
    },
    tiktok: {
      configured: tiktok.configured,
      redirectUri: tiktok.redirectUri,
      missingVars: [
        !tiktok.clientId ? 'TIKTOK_CLIENT_KEY' : null,
        !tiktok.clientSecret ? 'TIKTOK_CLIENT_SECRET' : null
      ].filter(Boolean)
    }
  };
}

/**
 * Gera a URL oficial de autorização OAuth 2.0 / 2.1 com State (CSRF) e PKCE (S256)
 */
function buildAuthorizationUrl({ provider, req, state, codeChallenge }) {
  const creds = getProviderCredentials(provider, req);
  if (!creds) {
    const err = new Error('Provedor de autenticação inválido.');
    err.code = 'INVALID_PROVIDER';
    throw err;
  }

  if (!creds.configured) {
    const err = new Error(`Credenciais OAuth da ${creds.name} (${creds.provider.toUpperCase()}_CLIENT_ID / ${creds.provider.toUpperCase()}_CLIENT_SECRET) não configuradas no servidor.`);
    err.code = 'PROVIDER_NOT_CONFIGURED';
    throw err;
  }

  if (creds.provider === 'twitch') {
    // Documentação Oficial Twitch OAuth 2.0: https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#authorization-code-grant-flow
    const authEndpoint = process.env.TWITCH_AUTH_URL || 'https://id.twitch.tv/oauth2/authorize';
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: creds.clientId,
      redirect_uri: creds.redirectUri,
      scope: 'user:read:email',
      state,
      force_verify: 'false'
    });
    return `${authEndpoint}?${params.toString()}`;
  }

  if (creds.provider === 'kick') {
    // Documentação Oficial Kick OAuth 2.1 com PKCE (S256): https://docs.kick.com/getting-started/generating-tokens-oauth2-flow
    const authEndpoint = process.env.KICK_AUTH_URL || 'https://id.kick.com/oauth/authorize';
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: creds.clientId,
      redirect_uri: creds.redirectUri,
      scope: 'user:read channel:read',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });
    return `${authEndpoint}?${params.toString()}`;
  }

  if (creds.provider === 'google' || creds.provider === 'youtube') {
    // Documentação Oficial Google OpenID Connect / YouTube Data API v3
    const authEndpoint = process.env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth';
    const scope = creds.provider === 'youtube'
      ? 'openid email profile https://www.googleapis.com/auth/youtube.readonly'
      : 'openid email profile';
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: creds.clientId,
      redirect_uri: creds.redirectUri,
      scope,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'select_account'
    });
    return `${authEndpoint}?${params.toString()}`;
  }

  if (creds.provider === 'tiktok') {
    // Documentação Oficial TikTok Login Kit OAuth 2.0 (PKCE S256): https://developers.tiktok.com/doc/login-kit-web/
    const authEndpoint = process.env.TIKTOK_AUTH_URL || 'https://www.tiktok.com/v2/auth/authorize/';
    const scope = (process.env.TIKTOK_SCOPE || 'user.info.basic').trim();
    const params = new URLSearchParams({
      client_key: creds.clientId,
      response_type: 'code',
      scope,
      redirect_uri: creds.redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });
    return `${authEndpoint}?${params.toString()}`;
  }

  throw new Error('Provedor desconhecido.');
}

/**
 * Realiza a troca do Authorization Code pelo Access Token e obtém o perfil oficial do usuário
 */
async function exchangeCodeAndFetchProfile({ provider, req, code, codeVerifier }) {
  const creds = getProviderCredentials(provider, req);
  if (!creds || !creds.configured) {
    const err = new Error('Credenciais do provedor OAuth não configuradas.');
    err.code = 'PROVIDER_NOT_CONFIGURED';
    throw err;
  }

  if (creds.provider === 'twitch') {
    return await handleTwitchCallback({ creds, code });
  }
  if (creds.provider === 'kick') {
    return await handleKickCallback({ creds, code, codeVerifier });
  }
  if (creds.provider === 'google') {
    return await handleGoogleCallback({ creds, code, codeVerifier });
  }
  if (creds.provider === 'youtube') {
    return await handleYouTubeCallback({ creds, code, codeVerifier });
  }
  if (creds.provider === 'tiktok') {
    return await handleTikTokCallback({ creds, code, codeVerifier });
  }

  throw new Error('Provedor OAuth inválido.');
}

async function handleTwitchCallback({ creds, code }) {
  const tokenUrl = process.env.TWITCH_TOKEN_URL || 'https://id.twitch.tv/oauth2/token';
  const userUrl = process.env.TWITCH_USER_URL || 'https://api.twitch.tv/helix/users';

  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: creds.redirectUri
  }).toString();

  const tokenRes = await httpRequestJson(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!tokenRes.ok || !tokenRes.data?.access_token) {
    const err = new Error(tokenRes.data?.message || 'Falha ao validar código de autorização na Twitch.');
    err.code = 'TOKEN_EXCHANGE_FAILED';
    throw err;
  }

  const accessToken = tokenRes.data.access_token;
  const refreshToken = tokenRes.data.refresh_token || null;
  const scopes = Array.isArray(tokenRes.data.scope) ? tokenRes.data.scope : ['user:read:email'];

  const userRes = await httpRequestJson(userUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Client-Id': creds.clientId
    }
  });

  const twitchUser = userRes.data?.data?.[0];
  if (!userRes.ok || !twitchUser || !twitchUser.id) {
    const err = new Error('Não foi possível obter os dados de perfil do usuário na API Helix da Twitch.');
    err.code = 'PROFILE_FETCH_FAILED';
    throw err;
  }

  return {
    provider: 'twitch',
    providerUserId: String(twitchUser.id),
    username: twitchUser.login || '',
    displayName: twitchUser.display_name || twitchUser.login || '',
    email: twitchUser.email || '',
    avatarUrl: twitchUser.profile_image_url || '',
    accessToken,
    refreshToken,
    scopes
  };
}

async function handleKickCallback({ creds, code, codeVerifier }) {
  const tokenUrl = process.env.KICK_TOKEN_URL || 'https://id.kick.com/oauth/token';
  const userUrl = process.env.KICK_USER_URL || 'https://api.kick.com/public/v1/users';

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    redirect_uri: creds.redirectUri,
    code_verifier: codeVerifier,
    code
  }).toString();

  const tokenRes = await httpRequestJson(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!tokenRes.ok || !tokenRes.data?.access_token) {
    const err = new Error(tokenRes.data?.error_description || tokenRes.data?.error || 'Falha ao trocar código de autorização na Kick.');
    err.code = 'TOKEN_EXCHANGE_FAILED';
    throw err;
  }

  const accessToken = tokenRes.data.access_token;
  const refreshToken = tokenRes.data.refresh_token || null;
  const scopes = typeof tokenRes.data.scope === 'string'
    ? tokenRes.data.scope.split(/\s+/).filter(Boolean)
    : ['user:read', 'channel:read'];

  const userRes = await httpRequestJson(userUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  // A API oficial da Kick (/public/v1/users) retorna { data: [ { user_id, name, email, profile_picture } ] }
  const rawData = userRes.data?.data;
  const kickUser = Array.isArray(rawData) ? rawData[0] : (rawData || userRes.data);
  const kickId = kickUser?.user_id || kickUser?.id;

  if (!userRes.ok || !kickId) {
    const err = new Error('Não foi possível recuperar os dados do usuário na API oficial da Kick.');
    err.code = 'PROFILE_FETCH_FAILED';
    throw err;
  }

  const kickUsername = kickUser.name || kickUser.username || kickUser.slug || `kick_${kickId}`;

  return {
    provider: 'kick',
    providerUserId: String(kickId),
    username: kickUsername,
    displayName: kickUser.name || kickUser.display_name || kickUsername,
    email: kickUser.email || '',
    avatarUrl: kickUser.profile_picture || kickUser.avatar || '',
    accessToken,
    refreshToken,
    scopes
  };
}

async function handleGoogleCallback({ creds, code, codeVerifier }) {
  const tokenUrl = process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
  const userUrl = process.env.GOOGLE_USER_URL || 'https://openidconnect.googleapis.com/v1/userinfo';

  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    code,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: creds.redirectUri
  }).toString();

  const tokenRes = await httpRequestJson(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!tokenRes.ok || !tokenRes.data?.access_token) {
    const err = new Error(tokenRes.data?.error_description || 'Falha ao trocar código de autorização no Google OAuth.');
    err.code = 'TOKEN_EXCHANGE_FAILED';
    throw err;
  }

  const accessToken = tokenRes.data.access_token;
  const refreshToken = tokenRes.data.refresh_token || null;
  const scopes = typeof tokenRes.data.scope === 'string'
    ? tokenRes.data.scope.split(/\s+/).filter(Boolean)
    : ['openid', 'email', 'profile'];

  const userRes = await httpRequestJson(userUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  const googleUser = userRes.data;
  if (!userRes.ok || !googleUser || !googleUser.sub) {
    const err = new Error('Não foi possível validar a identidade OpenID Connect no Google.');
    err.code = 'PROFILE_FETCH_FAILED';
    throw err;
  }

  const emailPrefix = googleUser.email ? googleUser.email.split('@')[0] : `google_${googleUser.sub.slice(-6)}`;

  return {
    provider: 'google',
    providerUserId: String(googleUser.sub),
    username: emailPrefix,
    displayName: googleUser.name || googleUser.given_name || emailPrefix,
    email: googleUser.email || '',
    avatarUrl: googleUser.picture || '',
    accessToken,
    refreshToken,
    scopes
  };
}

async function handleYouTubeCallback({ creds, code, codeVerifier }) {
  const tokenUrl = process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
  const userUrl = process.env.GOOGLE_USER_URL || 'https://openidconnect.googleapis.com/v1/userinfo';
  const ytChannelsUrl = process.env.YOUTUBE_CHANNELS_URL || 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true';

  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    code,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: creds.redirectUri
  }).toString();

  const tokenRes = await httpRequestJson(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!tokenRes.ok || !tokenRes.data?.access_token) {
    const err = new Error(tokenRes.data?.error_description || 'Falha ao trocar código de autorização do YouTube/Google.');
    err.code = 'TOKEN_EXCHANGE_FAILED';
    throw err;
  }

  const accessToken = tokenRes.data.access_token;
  const refreshToken = tokenRes.data.refresh_token || null;
  const scopes = typeof tokenRes.data.scope === 'string'
    ? tokenRes.data.scope.split(/\s+/).filter(Boolean)
    : ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/youtube.readonly'];

  // 1. Busca dados do canal YouTube autenticado
  const ytRes = await httpRequestJson(ytChannelsUrl, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!ytRes.ok) {
    const apiMsg = ytRes.data?.error?.message || '';
    if (ytRes.status === 403 && /disabled|not been used/i.test(apiMsg)) {
      const err = new Error('A YouTube Data API v3 não está ativada no seu projeto do Google Cloud Console.');
      err.code = 'YOUTUBE_API_DISABLED';
      throw err;
    }
    const err = new Error(apiMsg || 'Falha ao consultar canal do YouTube na YouTube Data API v3.');
    err.code = 'PROFILE_FETCH_FAILED';
    throw err;
  }

  const channel = ytRes.data?.items?.[0];
  if (!channel || !channel.id) {
    const err = new Error('Esta conta Google não possui um canal do YouTube criado.');
    err.code = 'YOUTUBE_NO_CHANNEL';
    throw err;
  }

  // Opcional: busca e-mail da conta Google vinculada ao canal
  let email = '';
  try {
    const userRes = await httpRequestJson(userUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (userRes.ok && userRes.data?.email) {
      email = userRes.data.email;
    }
  } catch (e) {}

  const snippet = channel.snippet || {};
  const customHandle = snippet.customUrl || channel.id;
  const avatarUrl = snippet.thumbnails?.default?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.high?.url || '';

  return {
    provider: 'youtube',
    providerUserId: String(channel.id),
    username: customHandle,
    displayName: snippet.title || customHandle,
    email,
    avatarUrl,
    accessToken,
    refreshToken,
    scopes
  };
}

async function handleTikTokCallback({ creds, code, codeVerifier }) {
  const tokenUrl = process.env.TIKTOK_TOKEN_URL || 'https://open.tiktokapis.com/v2/oauth/token/';
  const baseUserUrl = process.env.TIKTOK_USER_URL || 'https://open.tiktokapis.com/v2/user/info/';

  const body = new URLSearchParams({
    client_key: creds.clientId,
    client_secret: creds.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: creds.redirectUri,
    code_verifier: codeVerifier
  }).toString();

  const tokenRes = await httpRequestJson(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!tokenRes.ok || !tokenRes.data?.access_token) {
    const err = new Error(tokenRes.data?.error_description || tokenRes.data?.error || 'Falha ao trocar código de autorização no TikTok.');
    err.code = 'TOKEN_EXCHANGE_FAILED';
    throw err;
  }

  const accessToken = tokenRes.data.access_token;
  const refreshToken = tokenRes.data.refresh_token || null;
  const scopes = typeof tokenRes.data.scope === 'string'
    ? tokenRes.data.scope.split(/[,\s]+/).filter(Boolean)
    : ['user.info.basic'];

  const fields = scopes.includes('user.info.profile')
    ? 'open_id,union_id,avatar_url,display_name,username'
    : 'open_id,union_id,avatar_url,display_name';

  const userRes = await httpRequestJson(`${baseUserUrl}?fields=${encodeURIComponent(fields)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  const ttUser = userRes.data?.data?.user;
  const ttId = ttUser?.union_id || ttUser?.open_id;
  if (!userRes.ok || !ttId) {
    const err = new Error(userRes.data?.error?.message || 'Não foi possível obter os dados de perfil na API oficial do TikTok.');
    err.code = 'PROFILE_FETCH_FAILED';
    throw err;
  }

  const ttHandle = ttUser.username || ttUser.display_name || `tiktok_${String(ttId).slice(-6)}`;

  return {
    provider: 'tiktok',
    providerUserId: String(ttId),
    username: ttHandle,
    displayName: ttUser.display_name || ttHandle,
    email: '',
    avatarUrl: ttUser.avatar_url || '',
    accessToken,
    refreshToken,
    scopes
  };
}

module.exports = {
  getAppBaseUrl,
  getProviderCredentials,
  getProvidersConfigStatus,
  buildAuthorizationUrl,
  exchangeCodeAndFetchProfile
};
