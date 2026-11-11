const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'database.json');
const ENV_PATH = path.join(__dirname, '..', '.env');

// Carrega variáveis do arquivo .env se existir (sem precisar de pacotes extras)
function loadEnvFile() {
  try {
    if (fs.existsSync(ENV_PATH)) {
      const content = fs.readFileSync(ENV_PATH, 'utf8');
      content.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) return;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) {
          process.env[key] = val;
        }
      });
    }
  } catch (e) {
    console.error('[AuthDB] Erro ao ler .env:', e.message);
  }
}

loadEnvFile();

if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
}

const SESSION_SECRET = process.env.SESSION_SECRET || process.env.AUTH_SECRET || 'multichat-studio-unified-secret-key-2026';
const ENCRYPTION_KEY = crypto.createHash('sha256').update(String(SESSION_SECRET)).digest();

// Criptografia AES-256-GCM para proteger tokens OAuth no banco de dados
function encryptToken(plainText) {
  if (!plainText) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decryptToken(cipherText) {
  if (!cipherText || typeof cipherText !== 'string') return null;
  try {
    const [ivB64, tagB64, dataB64] = cipherText.split('.');
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const iv = Buffer.from(ivB64, 'base64url');
    const tag = Buffer.from(tagB64, 'base64url');
    const encrypted = Buffer.from(dataB64, 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch (e) {
    return null;
  }
}

function getDefaultUserConfig(initialPlatform = null, initialHandle = '') {
  const cleanHandle = String(initialHandle || '').replace(/^@/, '').trim();
  return {
    platforms: {
      twitch: {
        enabled: initialPlatform === 'twitch' && Boolean(cleanHandle),
        channel: initialPlatform === 'twitch' ? cleanHandle : ''
      },
      youtube: {
        enabled: false,
        channelOrLiveId: ''
      },
      tiktok: {
        enabled: false,
        username: ''
      },
      kick: {
        enabled: initialPlatform === 'kick' && Boolean(cleanHandle),
        channel: initialPlatform === 'kick' ? cleanHandle : ''
      }
    },
    styles: {
      bubbleBg: '#EDEDED',
      textColor: '#000000',
      usernameBg: '#000000',
      usernameColor: '#ffffff',
      titleSize: 13,
      fontSize: 15,
      bubbleRadius: 18,
      maxMessages: 7,
      fadeTime: 0,
      direction: 'top-down',
      iconStyle: 'white',
      showPlatformIcon: true,
      showSubBadge: true,
      soundEnabled: false,
      soundVolume: 0.5
    },
    socials: {
      items: [
        { id: 'soc_1', platform: 'youtube', handle: cleanHandle || 'seu_canal', enabled: true },
        { id: 'soc_2', platform: 'instagram', handle: cleanHandle || 'seu_insta', enabled: true },
        { id: 'soc_3', platform: 'tiktok', handle: cleanHandle ? `@${cleanHandle}` : '@seu_tiktok', enabled: true }
      ],
      styles: {
        pillBg: '#EDEDED',
        textColor: '#0F1115',
        iconBg: '#0F1115',
        iconStyle: 'white',
        layout: 'horizontal',
        fontSize: 15,
        mode: 'loop',
        holdTime: 8,
        intervalTime: 15
      }
    }
  };
}

function normalizeUsername(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_.-]/g, '')
    .slice(0, 36);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, originalHash] = storedHash.split(':');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(originalHash, 'hex'));
}

function createEmptyDb() {
  return {
    version: 2,
    users: {},          // userId -> UserRecord
    usernameIndex: {},  // normalizedUsername -> userId
    overlayIndex: {},   // overlayToken -> userId
    providerIndex: {},  // "${provider}:${providerUserId}" -> userId
    sessions: {},       // sessionId -> SessionRecord
    oauthStates: {}     // state -> OAuthStateRecord
  };
}

function loadDatabase() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      return {
        ...createEmptyDb(),
        ...parsed
      };
    }
  } catch (e) {
    console.error('[AuthDB] Erro ao carregar database.json:', e.message);
  }
  return createEmptyDb();
}

let db = loadDatabase();

function saveDatabase() {
  try {
    const tmpPath = `${DB_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf8');
    fs.renameSync(tmpPath, DB_PATH);
  } catch (e) {
    console.error('[AuthDB] Erro ao salvar database.json:', e.message);
  }
}

function rebuildIndexes() {
  db.usernameIndex = {};
  db.overlayIndex = {};
  db.providerIndex = {};

  for (const [uid, user] of Object.entries(db.users)) {
    if (user.username) {
      db.usernameIndex[normalizeUsername(user.username)] = uid;
    }
    if (user.overlayToken) {
      db.overlayIndex[user.overlayToken] = uid;
    }
    if (user.linkedAccounts && typeof user.linkedAccounts === 'object') {
      for (const [prov, acc] of Object.entries(user.linkedAccounts)) {
        if (acc && acc.providerUserId) {
          db.providerIndex[`${prov}:${acc.providerUserId}`] = uid;
        }
      }
    }
  }
}
rebuildIndexes();

function generateUniqueUsername(baseName) {
  let base = normalizeUsername(baseName) || 'streamer';
  if (base.length < 3) base = `${base}_user`;
  if (!db.usernameIndex[base]) return base;
  let counter = 2;
  while (db.usernameIndex[`${base}${counter}`]) {
    counter++;
  }
  return `${base}${counter}`;
}

function generateOverlayToken() {
  return `ovk_${crypto.randomBytes(20).toString('hex')}`;
}

// ============================================================================
// OPERAÇÕES DE USUÁRIOS E VINCULAÇÃO DE CONTAS (UNIFIED USER SYSTEM)
// ============================================================================
function toPublicUser(user) {
  if (!user) return null;
  const linked = {};
  for (const [prov, info] of Object.entries(user.linkedAccounts || {})) {
    if (info) {
      linked[prov] = {
        provider: prov,
        providerUserId: info.providerUserId,
        username: info.username || '',
        displayName: info.displayName || info.username || '',
        email: info.email || '',
        avatarUrl: info.avatarUrl || '',
        linkedAt: info.linkedAt
      };
    }
  }

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    email: user.email || '',
    avatarUrl: user.avatarUrl || '',
    primaryProvider: user.primaryProvider || 'local',
    hasPassword: Boolean(user.passwordHash),
    overlayToken: user.overlayToken,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    linkedAccounts: linked
  };
}

function getUserById(userId) {
  return db.users[userId] || null;
}

function getUserByOverlayToken(overlayToken) {
  if (!overlayToken) return null;
  const uid = db.overlayIndex[String(overlayToken).trim()];
  return uid ? db.users[uid] || null : null;
}

function getUserByProvider(provider, providerUserId) {
  if (!provider || !providerUserId) return null;
  const key = `${provider}:${providerUserId}`;
  const uid = db.providerIndex[key];
  return uid ? db.users[uid] || null : null;
}

function registerLocalUser({ username, displayName, email, password }) {
  const cleanUsername = normalizeUsername(username);
  if (!cleanUsername || cleanUsername.length < 3) {
    throw new Error('O nome de usuário deve ter pelo menos 3 caracteres válidos (letras, números, _ ou .).');
  }
  if (!password || String(password).length < 6) {
    throw new Error('A senha deve ter pelo menos 6 caracteres por segurança.');
  }
  if (db.usernameIndex[cleanUsername]) {
    throw new Error('Este nome de usuário já está cadastrado. Escolha outro ou faça login.');
  }

  const cleanEmail = String(email || '').trim().toLowerCase();
  if (cleanEmail) {
    const emailConflict = Object.values(db.users).find(
      u => u.email && u.email.toLowerCase() === cleanEmail && u.primaryProvider === 'local'
    );
    if (emailConflict) {
      throw new Error('Já existe uma conta local cadastrada com este e-mail.');
    }
  }

  const now = new Date().toISOString();
  const userId = `usr_${crypto.randomBytes(12).toString('hex')}`;
  const overlayToken = generateOverlayToken();

  const user = {
    id: userId,
    username: cleanUsername,
    displayName: String(displayName || username || cleanUsername).trim(),
    email: cleanEmail,
    avatarUrl: '',
    passwordHash: hashPassword(password),
    primaryProvider: 'local',
    linkedAccounts: {},
    overlayToken,
    createdAt: now,
    lastLoginAt: now,
    config: getDefaultUserConfig(null, cleanUsername)
  };

  db.users[userId] = user;
  rebuildIndexes();
  saveDatabase();
  return user;
}

function authenticateLocalUser(usernameOrEmail, password) {
  const raw = String(usernameOrEmail || '').trim().toLowerCase();
  if (!raw || !password) {
    throw new Error('Informe seu usuário/e-mail e sua senha.');
  }

  const cleanUser = normalizeUsername(raw);
  let user = null;

  if (db.usernameIndex[cleanUser]) {
    user = db.users[db.usernameIndex[cleanUser]];
  } else if (raw.includes('@')) {
    // Busca apenas contas que possuem senha configurada
    user = Object.values(db.users).find(
      u => u.email && u.email.toLowerCase() === raw && u.passwordHash
    );
  }

  if (!user) {
    throw new Error('Conta não encontrada. Verifique o usuário digitado ou crie uma nova conta.');
  }

  if (!user.passwordHash) {
    throw new Error(`Esta conta foi criada via ${user.primaryProvider.toUpperCase()}. Entre usando o botão da plataforma correspondente.`);
  }

  if (!verifyPassword(password, user.passwordHash)) {
    throw new Error('Senha incorreta. Tente novamente.');
  }

  user.lastLoginAt = new Date().toISOString();
  saveDatabase();
  return user;
}

/**
 * Autentica ou cria conta via OAuth 2.0 oficial (Twitch, Kick, Google).
 * REGRA DE SEGURANÇA: NUNCA vincula automaticamente contas de provedores diferentes
 * apenas porque possuem o mesmo endereço de e-mail!
 */
function findOrCreateOAuthUser(profile) {
  const {
    provider,
    providerUserId,
    username,
    displayName,
    email,
    avatarUrl,
    accessToken,
    refreshToken,
    scopes
  } = profile;

  if (!provider || !providerUserId) {
    throw new Error('Dados de identidade do provedor OAuth inválidos.');
  }

  const now = new Date().toISOString();
  let user = getUserByProvider(provider, String(providerUserId));

  const linkedRecord = {
    provider,
    providerUserId: String(providerUserId),
    username: username || '',
    displayName: displayName || username || '',
    email: email ? String(email).toLowerCase() : '',
    avatarUrl: avatarUrl || '',
    accessTokenEnc: encryptToken(accessToken),
    refreshTokenEnc: encryptToken(refreshToken),
    scopes: Array.isArray(scopes) ? scopes : [],
    linkedAt: now
  };

  if (user) {
    // Usuário já tinha esta conta externa vinculada -> atualiza dados e tokens
    user.linkedAccounts = user.linkedAccounts || {};
    user.linkedAccounts[provider] = linkedRecord;
    if (!user.avatarUrl && avatarUrl) user.avatarUrl = avatarUrl;
    if (!user.displayName && displayName) user.displayName = displayName;
    user.lastLoginAt = now;

    // Se for Twitch, Kick, YouTube ou TikTok e o canal ainda estiver vazio na config, preenche automaticamente
    if (provider === 'twitch' && username && user.config?.platforms?.twitch && !user.config.platforms.twitch.channel) {
      user.config.platforms.twitch.channel = username;
      user.config.platforms.twitch.enabled = true;
    }
    if (provider === 'kick' && username && user.config?.platforms?.kick && !user.config.platforms.kick.channel) {
      user.config.platforms.kick.channel = username;
      user.config.platforms.kick.enabled = true;
    }
    if (provider === 'youtube' && (username || profile.providerUserId) && user.config?.platforms?.youtube && !user.config.platforms.youtube.channelOrLiveId) {
      user.config.platforms.youtube.channelOrLiveId = username || profile.providerUserId;
      user.config.platforms.youtube.enabled = true;
    }
    if (provider === 'tiktok' && username && user.config?.platforms?.tiktok && !user.config.platforms.tiktok.username) {
      user.config.platforms.tiktok.username = username.startsWith('@') ? username : `@${username}`;
      user.config.platforms.tiktok.enabled = true;
    }

    rebuildIndexes();
    saveDatabase();
    return { user, isNewUser: false };
  }

  // Primeiro acesso com este (provider, providerUserId): cria uma nova conta unificada
  // (Não faz merge automático por e-mail para impedir account takeover)
  const baseHandle = username || (email ? email.split('@')[0] : `${provider}_${providerUserId}`);
  const uniqueUsername = generateUniqueUsername(baseHandle);
  const userId = `usr_${crypto.randomBytes(12).toString('hex')}`;
  const overlayToken = generateOverlayToken();

  user = {
    id: userId,
    username: uniqueUsername,
    displayName: displayName || username || uniqueUsername,
    email: email ? String(email).toLowerCase() : '',
    avatarUrl: avatarUrl || '',
    passwordHash: null,
    primaryProvider: provider,
    linkedAccounts: {
      [provider]: linkedRecord
    },
    overlayToken,
    createdAt: now,
    lastLoginAt: now,
    config: getDefaultUserConfig(provider, username || uniqueUsername)
  };

  db.users[userId] = user;
  rebuildIndexes();
  saveDatabase();
  return { user, isNewUser: true };
}

/**
 * Vincula explicitamente uma conta externa (Twitch, Kick, Google) a um usuário JÁ autenticado.
 */
function linkProviderToUser(userId, profile) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('Sessão de usuário não encontrada para vinculação.');
  }

  const {
    provider,
    providerUserId,
    username,
    displayName,
    email,
    avatarUrl,
    accessToken,
    refreshToken,
    scopes
  } = profile;

  const existingOwner = getUserByProvider(provider, String(providerUserId));
  if (existingOwner && existingOwner.id !== user.id) {
    const err = new Error(`Esta conta ${provider.toUpperCase()} (${displayName || username || providerUserId}) já está vinculada a outra conta do MultiChat Studio.`);
    err.code = 'ACCOUNT_ALREADY_LINKED';
    throw err;
  }

  const now = new Date().toISOString();
  user.linkedAccounts = user.linkedAccounts || {};
  user.linkedAccounts[provider] = {
    provider,
    providerUserId: String(providerUserId),
    username: username || '',
    displayName: displayName || username || '',
    email: email ? String(email).toLowerCase() : '',
    avatarUrl: avatarUrl || '',
    accessTokenEnc: encryptToken(accessToken),
    refreshTokenEnc: encryptToken(refreshToken),
    scopes: Array.isArray(scopes) ? scopes : [],
    linkedAt: now
  };

  if (!user.avatarUrl && avatarUrl) user.avatarUrl = avatarUrl;
  if (!user.email && email) user.email = String(email).toLowerCase();

  // Se vinculou Twitch, Kick, YouTube ou TikTok, já preenche o canal caso esteja em branco
  if (provider === 'twitch' && username && user.config?.platforms?.twitch && !user.config.platforms.twitch.channel) {
    user.config.platforms.twitch.channel = username;
    user.config.platforms.twitch.enabled = true;
  }
  if (provider === 'kick' && username && user.config?.platforms?.kick && !user.config.platforms.kick.channel) {
    user.config.platforms.kick.channel = username;
    user.config.platforms.kick.enabled = true;
  }
  if (provider === 'youtube' && (username || profile.providerUserId) && user.config?.platforms?.youtube && !user.config.platforms.youtube.channelOrLiveId) {
    user.config.platforms.youtube.channelOrLiveId = username || profile.providerUserId;
    user.config.platforms.youtube.enabled = true;
  }
  if (provider === 'tiktok' && username && user.config?.platforms?.tiktok && !user.config.platforms.tiktok.username) {
    user.config.platforms.tiktok.username = username.startsWith('@') ? username : `@${username}`;
    user.config.platforms.tiktok.enabled = true;
  }

  rebuildIndexes();
  saveDatabase();
  return user;
}

/**
 * Desvincula uma conta externa (Twitch, Kick, Google) com proteção contra bloqueio de acesso.
 */
function unlinkProviderFromUser(userId, provider) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('Usuário não encontrado.');
  }

  if (!user.linkedAccounts || !user.linkedAccounts[provider]) {
    throw new Error(`Nenhuma conta ${provider.toUpperCase()} está vinculada ao seu perfil.`);
  }

  const remainingProviders = Object.keys(user.linkedAccounts).filter(p => p !== provider);
  const hasPassword = Boolean(user.passwordHash);

  if (remainingProviders.length === 0 && !hasPassword) {
    throw new Error('Você não pode desvincular seu único método de acesso sem antes definir uma senha ou vincular outra plataforma.');
  }

  delete user.linkedAccounts[provider];
  rebuildIndexes();
  saveDatabase();
  return user;
}

function regenerateUserOverlayToken(userId) {
  const user = getUserById(userId);
  if (!user) throw new Error('Usuário não encontrado.');
  user.overlayToken = generateOverlayToken();
  rebuildIndexes();
  saveDatabase();
  return user.overlayToken;
}

function updateUserConfig(userId, newConfig) {
  const user = getUserById(userId);
  if (!user) return null;
  user.config = newConfig;
  saveDatabase();
  return user.config;
}

// ============================================================================
// GERENCIAMENTO DE SESSÕES NO SERVIDOR (COOKIES HTTPONLY SEGUROS)
// ============================================================================
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 dias

function createSession(userId, meta = {}) {
  cleanupExpiredStatesAndSessions();
  const sessionId = `sess_${crypto.randomBytes(32).toString('hex')}`;
  const csrfToken = crypto.randomBytes(24).toString('hex');
  const now = Date.now();

  const session = {
    id: sessionId,
    userId,
    csrfToken,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: now + SESSION_TTL_MS,
    ip: meta.ip || '',
    userAgent: String(meta.userAgent || '').slice(0, 200)
  };

  db.sessions[sessionId] = session;
  saveDatabase();
  return session;
}

function getValidSession(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') return null;
  const session = db.sessions[sessionId];
  if (!session) return null;

  const now = Date.now();
  if (now > session.expiresAt) {
    delete db.sessions[sessionId];
    saveDatabase();
    return null;
  }

  const user = getUserById(session.userId);
  if (!user) {
    delete db.sessions[sessionId];
    saveDatabase();
    return null;
  }

  // Renovação deslizante automática (sliding window) se passou mais de 10 minutos
  if (now - session.lastSeenAt > 1000 * 60 * 10) {
    session.lastSeenAt = now;
    session.expiresAt = now + SESSION_TTL_MS;
    saveDatabase();
  }

  return { session, user };
}

function revokeSession(sessionId) {
  if (sessionId && db.sessions[sessionId]) {
    delete db.sessions[sessionId];
    saveDatabase();
    return true;
  }
  return false;
}

// ============================================================================
// GERENCIAMENTO DE STATE + PKCE (PROTEÇÃO CSRF NO OAUTH 2.0 / 2.1)
// ============================================================================
const OAUTH_STATE_TTL_MS = 1000 * 60 * 10; // 10 minutos

function createOAuthState({ provider, mode = 'login', linkingUserId = null }) {
  cleanupExpiredStatesAndSessions();
  const state = `st_${crypto.randomBytes(24).toString('hex')}`;
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const now = Date.now();

  const record = {
    state,
    provider,
    mode, // 'login' | 'link'
    linkingUserId,
    codeVerifier,
    codeChallenge,
    createdAt: now,
    expiresAt: now + OAUTH_STATE_TTL_MS
  };

  db.oauthStates[state] = record;
  saveDatabase();
  return record;
}

function consumeOAuthState(state) {
  if (!state || typeof state !== 'string') return null;
  const record = db.oauthStates[state];
  if (!record) return null;

  // Uso único (one-time token) contra ataques de replay
  delete db.oauthStates[state];
  saveDatabase();

  if (Date.now() > record.expiresAt) {
    return null;
  }
  return record;
}

function cleanupExpiredStatesAndSessions() {
  const now = Date.now();
  let changed = false;

  for (const [st, rec] of Object.entries(db.oauthStates || {})) {
    if (!rec || now > rec.expiresAt) {
      delete db.oauthStates[st];
      changed = true;
    }
  }

  for (const [sid, sess] of Object.entries(db.sessions || {})) {
    if (!sess || now > sess.expiresAt) {
      delete db.sessions[sid];
      changed = true;
    }
  }

  if (changed) saveDatabase();
}

module.exports = {
  loadEnvFile,
  getDefaultUserConfig,
  normalizeUsername,
  toPublicUser,
  getUserById,
  getUserByOverlayToken,
  getUserByProvider,
  registerLocalUser,
  authenticateLocalUser,
  findOrCreateOAuthUser,
  linkProviderToUser,
  unlinkProviderFromUser,
  regenerateUserOverlayToken,
  updateUserConfig,
  createSession,
  getValidSession,
  revokeSession,
  createOAuthState,
  consumeOAuthState,
  decryptToken
};
