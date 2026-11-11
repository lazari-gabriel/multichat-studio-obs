const express = require('express');
const http = require('http');
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

const CONFIG_PATH = path.join(__dirname, 'config.json');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('Erro ao ler config.json, usando padrão:', e);
  }
  return {
    port: 3333,
    platforms: {
      twitch: { enabled: true, channel: 'gabriellazarixd' },
      youtube: { enabled: false, channelOrLiveId: '' },
      tiktok: { enabled: false, username: '' },
      kick: { enabled: false, channel: 'coringa' }
    },
    styles: {
      bubbleBg: '#EDEDED',
      textColor: '#000000',
      usernameBg: '#000000',
      usernameColor: '#ffffff',
      fontSize: 15,
      bubbleRadius: 18,
      maxMessages: 8,
      fadeTime: 8,
      direction: 'top-down',
      iconStyle: 'white',
      showPlatformIcon: true,
      showSubBadge: true,
      soundEnabled: false,
      soundVolume: 0.5
    }
  };
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) {
    console.error('Erro ao salvar config.json:', e);
  }
}

let config = loadConfig();

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Disable caching so overlay and dashboard changes apply immediately
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Status store for dashboard
const platformStatus = {
  twitch: { state: 'disconnected', message: 'Desconectado' },
  youtube: { state: 'disconnected', message: 'Desconectado' },
  tiktok: { state: 'disconnected', message: 'Desconectado' },
  kick: { state: 'disconnected', message: 'Desconectado' }
};

// Keep recent messages in memory so opening /overlay always displays the latest messages immediately
let recentMessages = [
  {
    id: 'init_1',
    platform: 'twitch',
    username: 'lazari',
    isSubscriber: true,
    message: 'Salve galera da Twitch 🔥',
    timestamp: Date.now()
  },
  {
    id: 'init_2',
    platform: 'kick',
    username: 'lazari',
    isSubscriber: true,
    message: 'Família da Kick chegando pesado 🟢',
    timestamp: Date.now()
  },
  {
    id: 'init_3',
    platform: 'youtube',
    username: 'lazari',
    isSubscriber: false,
    message: 'YouTube chat ativado 🚀',
    timestamp: Date.now()
  }
];

function broadcast(type, payload) {
  const data = JSON.stringify({ type, payload });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(data);
      } catch (e) {}
    }
  });
}

function updateStatus(platform, state, message) {
  platformStatus[platform] = { state, message };
  broadcast('status_update', { platform, state, message });
}

const seenMessageIds = new Set();

function handleIncomingMessage(msg) {
  if (msg.id) {
    if (seenMessageIds.has(msg.id)) return;
    seenMessageIds.add(msg.id);
    if (seenMessageIds.size > 1000) {
      const first = seenMessageIds.values().next().value;
      seenMessageIds.delete(first);
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
  console.log(`[${msg.platform.toUpperCase()}] ${msg.username}: ${msg.message}`);

  recentMessages.push(msg);
  if (recentMessages.length > 10) {
    recentMessages = recentMessages.slice(-10);
  }

  broadcast('chat_message', msg);
}

// Connectors
const twitch = new TwitchConnector(handleIncomingMessage, updateStatus);
const youtube = new YouTubeConnector(handleIncomingMessage, updateStatus);
const tiktok = new TikTokConnector(handleIncomingMessage, updateStatus);
const kick = new KickConnector(handleIncomingMessage, updateStatus);
const webhook = new WebhookReceiver(handleIncomingMessage);

function applyPlatformConnections() {
  if (config.platforms.twitch?.enabled && config.platforms.twitch?.channel) {
    twitch.connect(config.platforms.twitch.channel);
  } else {
    twitch.disconnect();
    updateStatus('twitch', 'disconnected', 'Desativado');
  }

  if (config.platforms.youtube?.enabled && config.platforms.youtube?.channelOrLiveId) {
    youtube.connect(config.platforms.youtube.channelOrLiveId);
  } else {
    youtube.disconnect();
    updateStatus('youtube', 'disconnected', 'Desativado');
  }

  if (config.platforms.tiktok?.enabled && config.platforms.tiktok?.username) {
    tiktok.connect(config.platforms.tiktok.username);
  } else {
    tiktok.disconnect();
    updateStatus('tiktok', 'disconnected', 'Desativado');
  }

  if (config.platforms.kick?.enabled && config.platforms.kick?.channel) {
    kick.connect(config.platforms.kick.channel);
  } else {
    kick.disconnect();
    updateStatus('kick', 'disconnected', 'Desativado');
  }
}

// REST Routes
app.get('/overlay', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'overlay.html'));
});

app.get('/socials', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'socials.html'));
});

app.get('/redes', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'socials.html'));
});

app.get('/api/config', (req, res) => {
  res.json({
    config,
    statuses: platformStatus,
    recentMessages
  });
});

app.post('/api/config', (req, res) => {
  const newConfig = req.body;
  if (!newConfig) return res.status(400).json({ error: 'Config inválido' });

  const mergedSocials = newConfig.socials
    ? {
        ...(config.socials || {}),
        ...newConfig.socials,
        items: Array.isArray(newConfig.socials.items) ? newConfig.socials.items : (config.socials?.items || []),
        styles: { ...(config.socials?.styles || {}), ...(newConfig.socials.styles || {}) }
      }
    : config.socials;

  config = {
    ...config,
    ...newConfig,
    platforms: { ...config.platforms, ...(newConfig.platforms || {}) },
    styles: { ...config.styles, ...(newConfig.styles || {}) },
    socials: mergedSocials
  };

  saveConfig(config);
  if (newConfig.platforms) {
    applyPlatformConnections();
  }
  broadcast('config_update', config);
  res.json({ success: true, config });
});

app.post('/api/socials/trigger', (req, res) => {
  broadcast('socials_trigger', {});
  res.json({ success: true });
});

const CUSTOM_SOUND_PATH = path.join(__dirname, 'public', 'custom_sound.bin');

app.get('/api/sound/file', (req, res) => {
  if (!fs.existsSync(CUSTOM_SOUND_PATH)) {
    return res.status(404).end();
  }
  const mime = config.styles?.customSoundMime || 'audio/mpeg';
  res.setHeader('Content-Type', mime);
  res.sendFile(CUSTOM_SOUND_PATH);
});

app.post('/api/sound', (req, res) => {
  try {
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
    fs.writeFileSync(CUSTOM_SOUND_PATH, buffer);

    config.styles = {
      ...(config.styles || {}),
      soundEnabled: true,
      customSoundName: fileName || 'audio_personalizado.mp3',
      customSoundMime: mime,
      customSoundUrl: `/api/sound/file?t=${Date.now()}`
    };

    saveConfig(config);
    broadcast('config_update', config);
    res.json({ success: true, styles: config.styles });
  } catch (e) {
    console.error('Erro ao salvar áudio customizado:', e);
    res.status(500).json({ error: 'Falha ao salvar áudio' });
  }
});

app.delete('/api/sound', (req, res) => {
  try {
    if (fs.existsSync(CUSTOM_SOUND_PATH)) {
      fs.unlinkSync(CUSTOM_SOUND_PATH);
    }
    if (config.styles) {
      delete config.styles.customSoundName;
      delete config.styles.customSoundMime;
      delete config.styles.customSoundUrl;
    }
    saveConfig(config);
    broadcast('config_update', config);
    res.json({ success: true, styles: config.styles });
  } catch (e) {
    res.status(500).json({ error: 'Falha ao remover áudio' });
  }
});

app.post('/api/clear', (req, res) => {
  recentMessages = [];
  broadcast('clear_chat', {});
  res.json({ success: true });
});

app.post('/api/message', (req, res) => {
  const processed = webhook.processMessage(req.body);
  if (processed) {
    res.json({ success: true, message: processed });
  } else {
    res.status(400).json({ error: 'Formato de mensagem inválido' });
  }
});

app.post('/api/test', (req, res) => {
  const { platform = 'twitch' } = req.body;

  const sampleMessages = {
    twitch: [
      {
        username: 'lazari',
        message: 'Salve galera da Twitch 🔥',
        isSubscriber: true
      },
      {
        username: 'simpson_10',
        message: '😸 😸 😸 😸 😸 😸 😸',
        isSubscriber: true
      },
      {
        username: 'gusttavo_sep12',
        message: 'bom dia cheguei emoji novo?? Boa Boa 😸 😸',
        isSubscriber: true
      }
    ],
    kick: [
      {
        username: 'lazari',
        message: 'Família da Kick chegando pesado 🟢',
        isSubscriber: true
      },
      {
        username: 'grazya',
        message: 'Triste de ontem 😭 mas hoje vai dar bom!!',
        isSubscriber: true
      }
    ],
    youtube: [
      {
        username: 'lazari',
        message: 'YouTube chat ativado 🚀',
        isSubscriber: true
      },
      {
        username: 'mayaraxshz',
        message: 'Boa tarde a todos! Live top demaiss 👏🔥',
        isSubscriber: true
      }
    ],
    tiktok: [
      {
        username: 'ghost_rtd_',
        message: 'Cheguei do TikTok! Manda salveee 🔥',
        isSubscriber: true
      }
    ]
  };

  const list = sampleMessages[platform] || sampleMessages.twitch;
  const sample = list[Math.floor(Math.random() * list.length)];

  handleIncomingMessage({
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

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({
    type: 'init',
    payload: {
      config,
      statuses: platformStatus,
      recentMessages
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
});

const PORT = process.env.PORT || config.port || 3333;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🚀 CHAT MULTIPLATAFORMA OBS PRONTO!`);
  console.log(`📊 Painel de Controle: http://localhost:${PORT}`);
  console.log(`📺 Overlay Chat OBS:   http://localhost:${PORT}/overlay`);
  console.log(`📱 Overlay Redes OBS:  http://localhost:${PORT}/socials`);
  console.log(`======================================================\n`);
  applyPlatformConnections();
});
