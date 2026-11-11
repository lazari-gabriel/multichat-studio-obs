const express = require('express');
const http = require('http');
const { URL } = require('url');
const { WebSocketServer, WebSocket } = require('ws');
const path = require('path');
const fs = require('fs');

// Global Error Catchers to keep server running 24/7
process.on('uncaughtException', (err) => {
  console.error('[Servidor Protegido] uncaughtException:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Servidor Protegido] unhandledRejection:', reason);
});

const TwitchConnector = require('./connectors/twitch');
const YouTubeConnector = require('./connectors/youtube');
const TikTokConnector = require('./connectors/tiktok');
const KickConnector = require('./connectors/kick');
const WebhookReceiver = require('./connectors/webhook');

const authDb = require('./auth/db');
const oauth = require('./auth/oauth');

const SOUNDS_DIR = path.join(__dirname, 'public', 'sounds');
if (!fs.existsSync(SOUNDS_DIR)) {
  try { fs.mkdirSync(SOUNDS_DIR, { recursive: true }); } catch (e) {}
}

// ============================================================================
// PROTEÇÃO CONTRA TENTATIVAS ABUSIVAS DE LOGIN (RATE LIMITER POR IP)
// ============================================================================
const loginAttemptsByIp = new Map();
const RATE_LIMIT_WINDOW_MS = 1000 * 60 * 5; // 5 minutos
const MAX_AUTH_ATTEMPTS = 20;

function checkAuthRateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const record = loginAttemptsByIp.get(ip);

  if (!record || now > record.resetAt) {
    loginAttemptsByIp.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  record.count += 1;
  if (record.count > MAX_AUTH_ATTEMPTS) {
    const waitSec = Math.ceil((record.resetAt - now) / 1000);
    return res.status(429).json({
      error: `Muitas tentativas de autenticação. Aguarde ${waitSec} segundos antes de tentar novamente.`,
      code: 'RATE_LIMITED'
    });
  }
  next();
}

// ============================================================================
// UTILITÁRIOS DE COOKIE E SESSÃO SEGURA (HttpOnly, SameSite=Lax, Secure)
// ============================================================================
const SESSION_COOKIE_NAME = 'mc_sid';
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 14; // 14 dias

function parseCookies(cookieHeader = '') {
  const list = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const name = parts.shift()?.trim();
    if (name) {
      try {
        list[name] = decodeURIComponent(parts.join('=').trim());
      } catch (e) {
        list[name] = parts.join('=').trim();
      }
    }
  });
  return list;
}

function isSecureRequest(req) {
  if (req.secure) return true;
  if (req.headers && req.headers['x-forwarded-proto'] === 'https') return true;
  if (process.env.NODE_ENV === 'production') return true;
  return false;
}

function setSessionCookie(req, res, sessionId) {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_MAX_AGE_SEC}`
  ];
  if (isSecureRequest(req)) {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(req, res) {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ];
  if (isSecureRequest(req)) {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function getSessionFromRequest(req) {
  const cookies = parseCookies(req.headers?.cookie || '');
  const sessionId = cookies[SESSION_COOKIE_NAME];
  if (!sessionId) return null;
  return authDb.getValidSession(sessionId);
}

/**
 * Resolve o usuário autenticado para rotas que aceitam tanto a Sessão do Painel (Cookie HttpOnly)
 * quanto a Chave Exclusiva do OBS Browser Source (?key=ovk_... ou ?token=ovk_...).
 */
function resolveUserFromSessionOrOverlayKey(req) {
  const sessionAuth = getSessionFromRequest(req);
  if (sessionAuth && sessionAuth.user) {
    return { user: sessionAuth.user, session: sessionAuth.session, via: 'session' };
  }

  const rawKey = req.query?.key || req.query?.token || '';
  if (rawKey) {
    const overlayUser = authDb.getUserByOverlayToken(String(rawKey));
    if (overlayUser) {
      return { user: overlayUser, session: null, via: 'overlay_key' };
    }
  }

  return null;
}

// ============================================================================
// SALAS ISOLADAS POR USUÁRIO (MULTI-TENANT ROOM MANAGER)
// ============================================================================
const rooms = new Map(); // userId -> UserRoom

class UserRoom {
  constructor(user) {
    this.userId = user.id;
    this.username = user.username;
    this.config = user.config || authDb.getDefaultUserConfig(user.primaryProvider, user.username);
    this.wsClients = new Set();
    this.seenMessageIds = new Set();

    this.platformStatus = {
      twitch: { state: 'disconnected', message: 'Desconectado' },
      youtube: { state: 'disconnected', message: 'Desconectado' },
      tiktok: { state: 'disconnected', message: 'Desconectado' },
      kick: { state: 'disconnected', message: 'Desconectado' }
    };

    const displayUser = user.username || 'streamer';
    this.recentMessages = [
      {
        id: `init_1_${this.userId}`,
        platform: 'twitch',
        username: displayUser,
        isSubscriber: true,
        message: 'Salve galera da Twitch 🔥',
        timestamp: Date.now()
      },
      {
        id: `init_2_${this.userId}`,
        platform: 'kick',
        username: displayUser,
        isSubscriber: true,
        message: 'Família da Kick chegando pesado 🟢',
        timestamp: Date.now()
      },
      {
        id: `init_3_${this.userId}`,
        platform: 'youtube',
        username: displayUser,
        isSubscriber: false,
        message: 'YouTube chat ativado 🚀',
        timestamp: Date.now()
      }
    ];

    this.handleIncomingMessage = this.handleIncomingMessage.bind(this);
    this.updateStatus = this.updateStatus.bind(this);

    this.twitch = new TwitchConnector(this.handleIncomingMessage, this.updateStatus);
    this.youtube = new YouTubeConnector(this.handleIncomingMessage, this.updateStatus);
    this.tiktok = new TikTokConnector(this.handleIncomingMessage, this.updateStatus);
    this.kick = new KickConnector(this.handleIncomingMessage, this.updateStatus);
    this.webhook = new WebhookReceiver(this.handleIncomingMessage);

    this.applyPlatformConnections();
  }

  broadcast(type, payload) {
    const data = JSON.stringify({ type, payload });
    for (const client of this.wsClients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(data);
        } catch (e) {}
      }
    }
  }

  updateStatus(platform, state, message) {
    this.platformStatus[platform] = { state, message };
    this.broadcast('status_update', { platform, state, message });
  }

  handleIncomingMessage(msg) {
    if (msg.id) {
      if (this.seenMessageIds.has(msg.id)) return;
      this.seenMessageIds.add(msg.id);
      if (this.seenMessageIds.size > 1000) {
        const first = this.seenMessageIds.values().next().value;
        this.seenMessageIds.delete(first);
      }
    }

    if (msg.extraEmotesMap instanceof Map) {
      const obj = {};
      for (const [k, v] of msg.extraEmotesMap.entries()) {
        obj[k] = v;
      }
      msg.extraEmotes = obj;
      delete msg.extraEmotesMap;
    }

    console.log(`[Sala:${this.username}][${msg.platform.toUpperCase()}] ${msg.username}: ${msg.message}`);

    this.recentMessages.push(msg);
    if (this.recentMessages.length > 15) {
      this.recentMessages = this.recentMessages.slice(-15);
    }

    this.broadcast('chat_message', msg);
  }

  applyPlatformConnections() {
    const p = this.config.platforms || {};

    if (p.twitch?.enabled && p.twitch?.channel) {
      this.twitch.connect(p.twitch.channel);
    } else {
      this.twitch.disconnect();
      this.updateStatus('twitch', 'disconnected', 'Desativado');
    }

    if (p.youtube?.enabled && p.youtube?.channelOrLiveId) {
      this.youtube.connect(p.youtube.channelOrLiveId);
    } else {
      this.youtube.disconnect();
      this.updateStatus('youtube', 'disconnected', 'Desativado');
    }

    if (p.tiktok?.enabled && p.tiktok?.username) {
      this.tiktok.connect(p.tiktok.username);
    } else {
      this.tiktok.disconnect();
      this.updateStatus('tiktok', 'disconnected', 'Desativado');
    }

    if (p.kick?.enabled && p.kick?.channel) {
      this.kick.connect(p.kick.channel);
    } else {
      this.kick.disconnect();
      this.updateStatus('kick', 'disconnected', 'Desativado');
    }
  }

  persistConfig() {
    authDb.updateUserConfig(this.userId, this.config);
  }
}

function getOrCreateUserRoom(user) {
  if (!user || !user.id) return null;
  if (rooms.has(user.id)) {
    const existing = rooms.get(user.id);
    existing.username = user.username;
    return existing;
  }
  const room = new UserRoom(user);
  rooms.set(user.id, room);
  return room;
}

// ============================================================================
// MIDDLEWARES DE CONTROLE DE ACESSO E PROTEÇÃO DE ROTAS
// ============================================================================
function requireSessionApi(req, res, next) {
  const sessionAuth = getSessionFromRequest(req);
  if (!sessionAuth || !sessionAuth.user) {
    return res.status(401).json({
      authenticated: false,
      code: 'UNAUTHORIZED',
      error: 'Sessão inválida ou expirada. Faça login novamente para continuar.'
    });
  }
  req.authUser = sessionAuth.user;
  req.authSession = sessionAuth.session;
  req.room = getOrCreateUserRoom(sessionAuth.user);
  next();
}

function requireSessionOrOverlayApi(req, res, next) {
  const resolved = resolveUserFromSessionOrOverlayKey(req);
  if (!resolved || !resolved.user) {
    return res.status(401).json({
      authenticated: false,
      code: 'UNAUTHORIZED',
      error: 'Acesso negado. Faça login ou utilize uma URL de Overlay válida.'
    });
  }
  req.authUser = resolved.user;
  req.authSession = resolved.session;
  req.authVia = resolved.via;
  req.room = getOrCreateUserRoom(resolved.user);
  next();
}

function requireOverlayOrSessionPage(req, res, next) {
  const resolved = resolveUserFromSessionOrOverlayKey(req);
  if (!resolved || !resolved.user) {
    return res.redirect('/?auth_error=login_required');
  }
  req.authUser = resolved.user;
  req.room = getOrCreateUserRoom(resolved.user);
  next();
}

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Headers de segurança e desativação de cache em rotas dinâmicas
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// Bloqueia acesso direto a arquivos internos de overlay sem autenticação
app.use((req, res, next) => {
  const p = req.path.toLowerCase();
  if (p === '/overlay.html' || p === '/socials.html') {
    const resolved = resolveUserFromSessionOrOverlayKey(req);
    if (!resolved) {
      return res.redirect('/?auth_error=login_required');
    }
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ============================================================================
// ROTAS DE AUTENTICAÇÃO UNIFICADA E OAUTH 2.0 / 2.1 (TWITCH, KICK, GOOGLE)
// ============================================================================

// Status de configuração dos provedores OAuth (sem expor segredos)
app.get('/api/auth/providers', (req, res) => {
  res.json({
    providers: oauth.getProvidersConfigStatus(req)
  });
});

// Sessão atual do usuário autenticado
app.get('/api/auth/me', (req, res) => {
  const sessionAuth = getSessionFromRequest(req);
  if (!sessionAuth || !sessionAuth.user) {
    return res.status(401).json({
      authenticated: false,
      providers: oauth.getProvidersConfigStatus(req)
    });
  }

  const { user, session } = sessionAuth;
  // Renova cookie HttpOnly no navegador
  setSessionCookie(req, res, session.id);
  getOrCreateUserRoom(user);

  res.json({
    authenticated: true,
    user: authDb.toPublicUser(user),
    providers: oauth.getProvidersConfigStatus(req)
  });
});

// Cadastro local (Usuário + E-mail + Senha)
app.post('/api/auth/register', checkAuthRateLimit, (req, res) => {
  try {
    const { username, displayName, email, password } = req.body || {};
    const newUser = authDb.registerLocalUser({ username, displayName, email, password });
    const session = authDb.createSession(newUser.id, {
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    setSessionCookie(req, res, session.id);
    getOrCreateUserRoom(newUser);

    res.status(201).json({
      success: true,
      authenticated: true,
      user: authDb.toPublicUser(newUser)
    });
  } catch (err) {
    res.status(400).json({
      error: err.message || 'Não foi possível criar a conta.',
      code: 'REGISTER_FAILED'
    });
  }
});

// Login local (Usuário ou E-mail + Senha)
app.post('/api/auth/login', checkAuthRateLimit, (req, res) => {
  try {
    const { username, password } = req.body || {};
    const user = authDb.authenticateLocalUser(username, password);
    const session = authDb.createSession(user.id, {
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    setSessionCookie(req, res, session.id);
    getOrCreateUserRoom(user);

    res.json({
      success: true,
      authenticated: true,
      user: authDb.toPublicUser(user)
    });
  } catch (err) {
    res.status(401).json({
      error: err.message || 'Credenciais inválidas.',
      code: 'LOGIN_FAILED'
    });
  }
});

// Logout seguro (revoga sessão no banco e limpa cookie HttpOnly)
app.post('/api/auth/logout', (req, res) => {
  const cookies = parseCookies(req.headers?.cookie || '');
  if (cookies[SESSION_COOKIE_NAME]) {
    authDb.revokeSession(cookies[SESSION_COOKIE_NAME]);
  }
  clearSessionCookie(req, res);
  res.json({ success: true });
});

// Iniciar fluxo OAuth 2.0 / 2.1 oficial (Login ou Vinculação de Conta)
function handleOAuthStart(req, res) {
  const provider = String(req.params.provider || '').toLowerCase();
  const validProviders = ['twitch', 'kick', 'google', 'youtube', 'tiktok'];

  if (!validProviders.includes(provider)) {
    return res.redirect('/?auth_error=invalid_provider');
  }

  const mode = req.query.mode === 'link' ? 'link' : 'login';
  let linkingUserId = null;

  if (mode === 'link') {
    const sessionAuth = getSessionFromRequest(req);
    if (!sessionAuth || !sessionAuth.user) {
      return res.redirect('/?auth_error=login_required');
    }
    linkingUserId = sessionAuth.user.id;
  }

  // Verifica se as credenciais OAuth estão configuradas no .env antes de criar state
  const creds = oauth.getProviderCredentials(provider, req);
  if (!creds || !creds.configured) {
    return res.redirect(`/?auth_error=provider_not_configured&provider=${encodeURIComponent(provider)}`);
  }

  try {
    const stateRecord = authDb.createOAuthState({
      provider,
      mode,
      linkingUserId
    });

    const authUrl = oauth.buildAuthorizationUrl({
      provider,
      req,
      state: stateRecord.state,
      codeChallenge: stateRecord.codeChallenge
    });

    return res.redirect(authUrl);
  } catch (err) {
    console.error(`[OAuth Start Error][${provider}]:`, err.message);
    const code = err.code === 'PROVIDER_NOT_CONFIGURED' ? 'provider_not_configured' : 'oauth_init_failed';
    return res.redirect(`/?auth_error=${code}&provider=${encodeURIComponent(provider)}`);
  }
}

app.get('/api/auth/oauth/:provider', checkAuthRateLimit, handleOAuthStart);
app.get('/auth/provider/:provider', checkAuthRateLimit, handleOAuthStart);

// Callback Oficial OAuth 2.0 / 2.1 (Twitch, Kick, Google, YouTube Live, TikTok Live)
app.get('/api/auth/callback/:provider', async (req, res) => {
  const provider = String(req.params.provider || '').toLowerCase();
  const { code, state, error, error_description } = req.query || {};

  // 1. Usuário cancelou a autorização ou provedor retornou erro explícito
  if (error) {
    let errProvider = provider;
    if (state) {
      const canceledState = authDb.consumeOAuthState(String(state));
      if (canceledState && (canceledState.provider === provider || (provider === 'google' && canceledState.provider === 'youtube'))) {
        errProvider = canceledState.provider;
      }
    }
    console.warn(`[OAuth Callback][${errProvider}] Cancelado/Erro pelo provedor:`, error, error_description || '');
    const errType = error === 'access_denied' ? 'access_denied' : 'provider_rejected';
    return res.redirect(`/?auth_error=${errType}&provider=${encodeURIComponent(errProvider)}`);
  }

  // 2. Validação obrigatória de code e state (CSRF + Replay Protection)
  if (!code || !state) {
    return res.redirect(`/?auth_error=invalid_callback&provider=${encodeURIComponent(provider)}`);
  }

  const stateRecord = authDb.consumeOAuthState(String(state));
  const isGoogleForYouTube = provider === 'google' && stateRecord?.provider === 'youtube';
  if (!stateRecord || (stateRecord.provider !== provider && !isGoogleForYouTube)) {
    return res.redirect(`/?auth_error=invalid_state&provider=${encodeURIComponent(provider)}`);
  }

  const effectiveProvider = isGoogleForYouTube ? 'youtube' : provider;

  try {
    // 3. Troca o código de autorização por tokens no backend e busca perfil oficial
    const profile = await oauth.exchangeCodeAndFetchProfile({
      provider: effectiveProvider,
      req,
      code: String(code),
      codeVerifier: stateRecord.codeVerifier
    });

    // 4A. Fluxo de VINCULAÇÃO EXPLÍCITA DE CONTA (usuário já autenticado)
    if (stateRecord.mode === 'link') {
      const sessionAuth = getSessionFromRequest(req);
      if (!sessionAuth || !sessionAuth.user || sessionAuth.user.id !== stateRecord.linkingUserId) {
        return res.redirect(`/?auth_error=session_mismatch&provider=${encodeURIComponent(effectiveProvider)}`);
      }

      const updatedUser = authDb.linkProviderToUser(sessionAuth.user.id, profile);
      const room = getOrCreateUserRoom(updatedUser);
      room.config = updatedUser.config;
      room.applyPlatformConnections();

      return res.redirect(`/?auth_linked=${encodeURIComponent(effectiveProvider)}`);
    }

    // 4B. Fluxo de LOGIN / PRIMEIRO CADASTRO via OAuth
    const { user } = authDb.findOrCreateOAuthUser(profile);
    const session = authDb.createSession(user.id, {
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    setSessionCookie(req, res, session.id);
    const room = getOrCreateUserRoom(user);
    room.config = user.config;
    room.applyPlatformConnections();

    return res.redirect(`/?auth_success=${encodeURIComponent(effectiveProvider)}`);
  } catch (err) {
    console.error(`[OAuth Callback Error][${effectiveProvider}]:`, err.message);
    if (err.code === 'ACCOUNT_ALREADY_LINKED') {
      return res.redirect(`/?auth_error=account_already_linked&provider=${encodeURIComponent(effectiveProvider)}`);
    }
    if (err.code === 'YOUTUBE_API_DISABLED') {
      return res.redirect(`/?auth_error=youtube_api_disabled&provider=${encodeURIComponent(effectiveProvider)}`);
    }
    if (err.code === 'YOUTUBE_NO_CHANNEL') {
      return res.redirect(`/?auth_error=youtube_no_channel&provider=${encodeURIComponent(effectiveProvider)}`);
    }
    if (err.code === 'TOKEN_EXCHANGE_FAILED') {
      return res.redirect(`/?auth_error=token_exchange_failed&provider=${encodeURIComponent(effectiveProvider)}`);
    }
    if (err.code === 'PROFILE_FETCH_FAILED') {
      return res.redirect(`/?auth_error=profile_fetch_failed&provider=${encodeURIComponent(effectiveProvider)}`);
    }
    return res.redirect(`/?auth_error=oauth_failed&provider=${encodeURIComponent(effectiveProvider)}`);
  }
});

// Desvincular uma conta externa (Twitch, Kick, Google, YouTube Live, TikTok Live)
app.delete('/api/auth/link/:provider', requireSessionApi, (req, res) => {
  try {
    const provider = String(req.params.provider || '').toLowerCase();
    if (!['twitch', 'kick', 'google', 'youtube', 'tiktok'].includes(provider)) {
      return res.status(400).json({ error: 'Provedor inválido.' });
    }

    const updatedUser = authDb.unlinkProviderFromUser(req.authUser.id, provider);
    res.json({
      success: true,
      user: authDb.toPublicUser(updatedUser)
    });
  } catch (err) {
    res.status(400).json({
      error: err.message || 'Não foi possível desvincular a conta.',
      code: 'UNLINK_FAILED'
    });
  }
});

// Regenerar token exclusivo das URLs de Overlay do OBS
app.post('/api/auth/overlay-token/regenerate', requireSessionApi, (req, res) => {
  try {
    const newToken = authDb.regenerateUserOverlayToken(req.authUser.id);
    const updatedUser = authDb.getUserById(req.authUser.id);
    res.json({
      success: true,
      overlayToken: newToken,
      user: authDb.toPublicUser(updatedUser)
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Falha ao regenerar chave do OBS.' });
  }
});

// ============================================================================
// ROTAS PROTEGIDAS DE OVERLAY E API
// ============================================================================
app.get('/overlay', requireOverlayOrSessionPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'overlay.html'));
});

app.get('/socials', requireOverlayOrSessionPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'socials.html'));
});

app.get('/redes', requireOverlayOrSessionPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'socials.html'));
});

app.get('/api/config', requireSessionOrOverlayApi, (req, res) => {
  const room = req.room;
  res.json({
    roomKey: room.username,
    config: room.config,
    statuses: room.platformStatus,
    recentMessages: room.recentMessages
  });
});

app.post('/api/config', requireSessionApi, (req, res) => {
  const room = req.room;
  const newConfig = req.body;
  if (!newConfig) return res.status(400).json({ error: 'Config inválido' });

  const mergedSocials = newConfig.socials
    ? {
        ...(room.config.socials || {}),
        ...newConfig.socials,
        items: Array.isArray(newConfig.socials.items) ? newConfig.socials.items : (room.config.socials?.items || []),
        styles: { ...(room.config.socials?.styles || {}), ...(newConfig.socials.styles || {}) }
      }
    : room.config.socials;

  room.config = {
    ...room.config,
    ...newConfig,
    platforms: { ...room.config.platforms, ...(newConfig.platforms || {}) },
    styles: { ...room.config.styles, ...(newConfig.styles || {}) },
    socials: mergedSocials
  };

  room.persistConfig();
  if (newConfig.platforms) {
    room.applyPlatformConnections();
  }
  room.broadcast('config_update', room.config);
  res.json({ success: true, roomKey: room.username, config: room.config });
});

app.post('/api/socials/trigger', requireSessionApi, (req, res) => {
  req.room.broadcast('socials_trigger', {});
  res.json({ success: true });
});

app.get('/api/sound/file', requireSessionOrOverlayApi, (req, res) => {
  const room = req.room;
  const soundPath = path.join(SOUNDS_DIR, `sound_${room.userId}.bin`);
  if (!fs.existsSync(soundPath)) {
    return res.status(404).end();
  }
  const mime = room.config.styles?.customSoundMime || 'audio/mpeg';
  res.setHeader('Content-Type', mime);
  res.sendFile(soundPath);
});

app.post('/api/sound', requireSessionApi, (req, res) => {
  try {
    const room = req.room;
    const user = req.authUser;
    const { fileName, dataUrl } = req.body || {};
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:audio/')) {
      return res.status(400).json({ error: 'Arquivo de áudio inválido' });
    }
    const match = dataUrl.match(/^data:(audio\/[^;]+);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Formato base64 inválido' });
    }
    const mime = match[1];
    const buffer = Buffer.from(match[2], 'base64');
    const soundPath = path.join(SOUNDS_DIR, `sound_${room.userId}.bin`);
    fs.writeFileSync(soundPath, buffer);

    room.config.styles = {
      ...(room.config.styles || {}),
      soundEnabled: true,
      customSoundName: fileName || 'audio_personalizado.mp3',
      customSoundMime: mime,
      customSoundUrl: `/api/sound/file?key=${encodeURIComponent(user.overlayToken)}&t=${Date.now()}`
    };

    room.persistConfig();
    room.broadcast('config_update', room.config);
    res.json({ success: true, styles: room.config.styles });
  } catch (e) {
    console.error('Erro ao salvar áudio customizado:', e);
    res.status(500).json({ error: 'Falha ao salvar áudio' });
  }
});

app.delete('/api/sound', requireSessionApi, (req, res) => {
  try {
    const room = req.room;
    const soundPath = path.join(SOUNDS_DIR, `sound_${room.userId}.bin`);
    if (fs.existsSync(soundPath)) {
      fs.unlinkSync(soundPath);
    }
    if (room.config.styles) {
      delete room.config.styles.customSoundName;
      delete room.config.styles.customSoundMime;
      delete room.config.styles.customSoundUrl;
    }
    room.persistConfig();
    room.broadcast('config_update', room.config);
    res.json({ success: true, styles: room.config.styles });
  } catch (e) {
    res.status(500).json({ error: 'Falha ao remover áudio' });
  }
});

app.post('/api/clear', requireSessionApi, (req, res) => {
  const room = req.room;
  room.recentMessages = [];
  room.broadcast('clear_chat', {});
  res.json({ success: true });
});

app.post('/api/message', requireSessionApi, (req, res) => {
  const room = req.room;
  const processed = room.webhook.processMessage(req.body);
  if (processed) {
    res.json({ success: true, message: processed });
  } else {
    res.status(400).json({ error: 'Formato de mensagem inválido' });
  }
});

app.post('/api/test', requireSessionApi, (req, res) => {
  const room = req.room;
  const { platform = 'twitch' } = req.body;

  const sampleMessages = {
    twitch: [
      { username: room.username, message: 'Salve galera da Twitch 🔥', isSubscriber: true },
      { username: 'simpson_10', message: '😸 😸 😸 😸 😸 😸 😸', isSubscriber: true },
      { username: 'gusttavo_sep12', message: 'bom dia cheguei emoji novo?? Boa Boa 😸 😸', isSubscriber: true }
    ],
    kick: [
      { username: room.username, message: 'Família da Kick chegando pesado 🟢', isSubscriber: true },
      { username: 'grazya', message: 'Hoje a live promete demais!! 🚀', isSubscriber: true }
    ],
    youtube: [
      { username: room.username, message: 'YouTube chat ativado 🚀', isSubscriber: true },
      { username: 'mayaraxshz', message: 'Boa tarde a todos! Live top demaiss 👏🔥', isSubscriber: true }
    ],
    tiktok: [
      { username: 'ghost_rtd_', message: 'Cheguei do TikTok! Manda salveee 🔥', isSubscriber: true }
    ]
  };

  const list = sampleMessages[platform] || sampleMessages.twitch;
  const sample = list[Math.floor(Math.random() * list.length)];

  room.handleIncomingMessage({
    id: `test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    platform,
    username: sample.username,
    isSubscriber: sample.isSubscriber,
    subBadgeUrl: null,
    isMod: false,
    isVip: false,
    isOwner: false,
    message: sample.message,
    timestamp: Date.now()
  });

  res.json({ success: true, sent: sample });
});

// WebSocket Protegido: aceita Cookie HttpOnly mc_sid (Painel) ou ?key=ovk_... (OBS Browser Source)
wss.on('connection', (ws, req) => {
  let keyFromUrl = null;
  try {
    const parsedUrl = new URL(req.url || '/', 'http://localhost');
    keyFromUrl = parsedUrl.searchParams.get('key') || parsedUrl.searchParams.get('token');
  } catch (e) {}

  req.query = { key: keyFromUrl };
  const resolved = resolveUserFromSessionOrOverlayKey(req);

  if (!resolved || !resolved.user) {
    try {
      ws.send(JSON.stringify({ type: 'unauthorized', payload: { error: 'Não autorizado' } }));
    } catch (e) {}
    ws.close(4001, 'Unauthorized');
    return;
  }

  const room = getOrCreateUserRoom(resolved.user);
  room.wsClients.add(ws);

  ws.send(JSON.stringify({
    type: 'init',
    payload: {
      roomKey: room.username,
      config: room.config,
      statuses: room.platformStatus,
      recentMessages: room.recentMessages
    }
  }));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    room.wsClients.delete(ws);
  });
});

const PORT = process.env.PORT || 3333;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🔒 MULTICHAT STUDIO PRO (UNIFIED AUTH + OAUTH 2.0) PRONTO!`);
  console.log(`📊 Painel de Controle: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
