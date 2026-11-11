// MultiChat Studio Dashboard Engine (Sistema Unificado de Contas + OAuth 2.0 Oficial)

let currentConfig = null;
let ws = null;
let currentUser = null;
let providersConfig = {};

// Segurança: limpa qualquer token legado que tenha ficado salvo em localStorage
try {
  localStorage.removeItem('multichat_auth_token');
  localStorage.removeItem('multichat_user');
} catch (e) {}

function getActiveOverlayKey() {
  return currentUser?.overlayToken || '';
}

function getChatOverlayUrl() {
  const key = getActiveOverlayKey();
  if (!key) return `${window.location.origin}/overlay`;
  return `${window.location.origin}/overlay?key=${encodeURIComponent(key)}`;
}

function getSocialsOverlayUrl() {
  const key = getActiveOverlayKey();
  if (!key) return `${window.location.origin}/socials`;
  return `${window.location.origin}/socials?key=${encodeURIComponent(key)}`;
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers: {
      ...(options.headers || {})
    }
  });
  if (res.status === 401 && currentUser) {
    handleSessionExpired();
  }
  return res;
}

// Elements
const platformsForm = document.getElementById('platforms-form');
const copyBtn = document.getElementById('copy-overlay-btn');
const quickCopyBox = document.getElementById('quick-copy-box');
const clearPreviewBtn = document.getElementById('clear-preview-btn');
const toast = document.getElementById('toast');
const previewContainer = document.getElementById('preview-chat-container');
const serverStatusText = document.getElementById('server-status-text');

// Platform inputs
const twitchEnabled = document.getElementById('twitch-enabled');
const twitchChannel = document.getElementById('twitch-channel');
const youtubeEnabled = document.getElementById('youtube-enabled');
const youtubeTarget = document.getElementById('youtube-target');
const tiktokEnabled = document.getElementById('tiktok-enabled');
const tiktokUsername = document.getElementById('tiktok-username');
const kickEnabled = document.getElementById('kick-enabled');
const kickChannel = document.getElementById('kick-channel');

// Style controls
const bubbleBg = document.getElementById('bubble-bg');
const bubbleBgVal = document.getElementById('bubble-bg-val');
const bubbleBgHex = document.getElementById('bubble-bg-hex');
const textColor = document.getElementById('text-color');
const textColorVal = document.getElementById('text-color-val');
const textColorHex = document.getElementById('text-color-hex');
const usernameBg = document.getElementById('username-bg');
const usernameBgVal = document.getElementById('username-bg-val');
const usernameBgHex = document.getElementById('username-bg-hex');
const iconStyleSelect = document.getElementById('icon-style-select');
const directionSelect = document.getElementById('direction-select');
const titleSize = document.getElementById('title-size');
const titleSizeVal = document.getElementById('title-size-val');
const fontSize = document.getElementById('font-size');
const fontSizeVal = document.getElementById('font-size-val');
const bubbleRadius = document.getElementById('bubble-radius');
const bubbleRadiusVal = document.getElementById('bubble-radius-val');
const fadeTime = document.getElementById('fade-time');
const fadeTimeVal = document.getElementById('fade-time-val');
const maxMessages = document.getElementById('max-messages');
const maxMessagesVal = document.getElementById('max-messages-val');
const showPlatformIcon = document.getElementById('show-platform-icon');
const showSubBadge = document.getElementById('show-sub-badge');
const soundEnabled = document.getElementById('sound-enabled');
const testSoundBtn = document.getElementById('test-sound-btn');
const customSoundFile = document.getElementById('custom-sound-file');
const customSoundDropzone = document.getElementById('custom-sound-dropzone');
const customSoundLabel = document.getElementById('custom-sound-label');
const customSoundSub = document.getElementById('custom-sound-sub');
const resetSoundBtn = document.getElementById('reset-sound-btn');

// Motor de Áudio do Painel (Áudio Customizado Arrastado ou WAV PCM 16-bit Padrão)
let dashAudioCtx = null;
let dashPopWavUrl = null;
let activeCustomSoundUrl = null;
let activeCustomSoundName = null;

function getDashPopWavUrl() {
  if (dashPopWavUrl) return dashPopWavUrl;
  try {
    const sampleRate = 44100;
    const duration = 0.14;
    const numSamples = Math.floor(sampleRate * duration);
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);
    const writeStr = (off, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
    };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, numSamples * 2, true);

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const freq = 580 + (480 * (t / duration));
      const env = Math.sin(Math.PI * (t / duration)) * Math.exp(-t * 14);
      const sample = Math.sin(2 * Math.PI * freq * t) * env * 0.78;
      view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 32767, true);
    }
    const blob = new Blob([buffer], { type: 'audio/wav' });
    dashPopWavUrl = URL.createObjectURL(blob);
    return dashPopWavUrl;
  } catch (e) {
    return null;
  }
}

function playDashboardSound(force = false) {
  if (!force && !soundEnabled?.checked) return;
  try {
    if (activeCustomSoundUrl) {
      const customAudio = new Audio(activeCustomSoundUrl);
      customAudio.volume = 0.9;
      customAudio.play().catch(() => {});
      return;
    }
    const url = getDashPopWavUrl();
    if (url) {
      const audio = new Audio(url);
      audio.volume = 0.85;
      audio.play().catch(() => {});
      return;
    }
    if (!dashAudioCtx) dashAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (dashAudioCtx.state === 'suspended') dashAudioCtx.resume();
    const osc = dashAudioCtx.createOscillator();
    const gain = dashAudioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(580, dashAudioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1020, dashAudioCtx.currentTime + 0.11);
    gain.gain.setValueAtTime(0.55, dashAudioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, dashAudioCtx.currentTime + 0.14);
    osc.connect(gain);
    gain.connect(dashAudioCtx.destination);
    osc.start();
    osc.stop(dashAudioCtx.currentTime + 0.14);
  } catch (e) {}
}

// Custom Simulator inputs
const customSimPlatform = document.getElementById('custom-sim-platform');
const customSimUser = document.getElementById('custom-sim-user');
const customSimMsg = document.getElementById('custom-sim-msg');
const customSimSub = document.getElementById('custom-sim-sub');
const sendCustomSimBtn = document.getElementById('send-custom-sim');

// Icons maps
const whiteIcons = {
  kick: `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" height="12" width="16"><path d="M1.333 0h8v5.333H12V2.667h2.667V0h8v8H20v2.667h-2.667v2.666H20V16h2.667v8h-8v-2.667H12v-2.666H9.333V24h-8Z" fill="#ffffff"></path></svg>`,
  twitch: `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" height="16" width="16"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0h1.714v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" fill="#ffffff"></path></svg>`,
  youtube: `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" height="16" width="16"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="#ffffff"></path></svg>`,
  tiktok: `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" height="16" width="16"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" fill="#ffffff"></path></svg>`
};

const coloredIcons = {
  kick: `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" height="12" width="16"><path d="M1.333 0h8v5.333H12V2.667h2.667V0h8v8H20v2.667h-2.667v2.666H20V16h2.667v8h-8v-2.667H12v-2.666H9.333V24h-8Z" fill="#53FC18"></path></svg>`,
  twitch: `<svg viewBox="0 0 24 24" height="16" width="16" fill="#9146FF"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0h1.714v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>`,
  youtube: `<svg viewBox="0 0 24 24" height="16" width="16"><path fill="#FF0000" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"/><path fill="#FFFFFF" d="m9.545 15.568 6.273-3.568-6.273-3.568z"/></svg>`,
  tiktok: `<svg viewBox="0 0 24 24" height="16" width="16"><path fill="#25F4EE" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/><path fill="#FE2C55" d="M16.435 0c.21.68.58 1.32 1.08 1.84 1.12 1.11 2.7 1.62 4.24 1.79v1.5c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93v-.01c-.13-.09-.27-.18-.39-.28-.5-.4-.91-.91-1.2-1.49l.09-1.45z"/></svg>`
};

const defaultSubSvg = `<svg viewBox="0 0 24 24" width="18" height="18"><path fill="#FFD700" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;

function showToast(text) {
  toast.textContent = text;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2400);
}

function renderStatus(platform, state, message) {
  const el = document.getElementById(`status-${platform}`);
  const card = document.getElementById(`card-${platform}`);
  if (!el) return;

  el.className = `plat-status ${state}`;
  if (state === 'connected') {
    el.textContent = message || 'Conectado';
    card?.classList.add('active-card');
  } else if (state === 'connecting') {
    el.textContent = 'Conectando...';
    card?.classList.remove('active-card');
  } else {
    el.textContent = 'Desconectado';
    card?.classList.remove('active-card');
  }
}

function updateSliderProgress(slider) {
  if (!slider) return;
  const min = parseFloat(slider.min) || 0;
  const max = parseFloat(slider.max) || 100;
  const val = parseFloat(slider.value) || 0;
  const pct = ((val - min) / (max - min)) * 100;
  slider.style.setProperty('--progress', `${Math.max(0, Math.min(100, pct))}%`);
}

function updatePreviewCSSVariables() {
  const root = document.documentElement;
  root.style.setProperty('--bubble-bg', bubbleBg.value);
  root.style.setProperty('--text-color', textColor.value);
  root.style.setProperty('--username-bg', usernameBg.value);
  if (titleSize) root.style.setProperty('--title-size', `${titleSize.value}px`);
  root.style.setProperty('--font-size', `${fontSize.value}px`);
  root.style.setProperty('--bubble-radius', `${bubbleRadius.value}px`);

  bubbleBgVal.textContent = bubbleBg.value.toUpperCase();
  textColorVal.textContent = textColor.value.toUpperCase();
  usernameBgVal.textContent = usernameBg.value.toUpperCase();

  if (bubbleBgHex && document.activeElement !== bubbleBgHex) {
    bubbleBgHex.value = bubbleBg.value.toUpperCase();
  }
  if (textColorHex && document.activeElement !== textColorHex) {
    textColorHex.value = textColor.value.toUpperCase();
  }
  if (usernameBgHex && document.activeElement !== usernameBgHex) {
    usernameBgHex.value = usernameBg.value.toUpperCase();
  }

  if (titleSize && titleSizeVal) titleSizeVal.textContent = `${titleSize.value}px`;
  fontSizeVal.textContent = `${fontSize.value}px`;
  bubbleRadiusVal.textContent = `${bubbleRadius.value}px`;
  fadeTimeVal.textContent = `${fadeTime.value}s`;
  maxMessagesVal.textContent = maxMessages.value;

  [titleSize, fontSize, bubbleRadius, fadeTime, maxMessages].forEach(updateSliderProgress);
}

// Render message in Dashboard Live Stage using exact chat.html structure + FLIP 60fps
const previewRenderedIds = new Set();
const previewQueue = [];
let isProcessingPreviewQueue = false;

function addPreviewMessage(msg, immediate = false) {
  if (!previewContainer || !msg) return;
  if (msg.id) {
    if (previewRenderedIds.has(msg.id)) return;
    previewRenderedIds.add(msg.id);
    if (previewRenderedIds.size > 500) {
      const first = previewRenderedIds.values().next().value;
      previewRenderedIds.delete(first);
    }
  }

  if (immediate) {
    renderPreviewMessageDOM(msg, true);
    return;
  }

  if (previewQueue.length > 5) {
    previewQueue.splice(0, previewQueue.length - 5);
  }
  previewQueue.push(msg);
  if (!isProcessingPreviewQueue) {
    processPreviewQueue();
  }
}

function processPreviewQueue() {
  if (previewQueue.length === 0) {
    isProcessingPreviewQueue = false;
    return;
  }
  isProcessingPreviewQueue = true;
  const nextMsg = previewQueue.shift();
  renderPreviewMessageDOM(nextMsg, false);

  setTimeout(processPreviewQueue, 210);
}

function renderPreviewMessageDOM(msg, immediate = false) {
  if (!immediate) {
    playDashboardSound(false);
  }

  const msgEl = document.createElement('div');
  msgEl.className = 'message';

  const platform = msg.platform || 'twitch';
  const iconsMap = iconStyleSelect.value === 'colored' ? coloredIcons : whiteIcons;
  const iconHTML = iconsMap[platform] || iconsMap.twitch;

  const safeDiv = document.createElement('div');
  safeDiv.textContent = msg.message || '';
  let htmlText = safeDiv.innerHTML;

  if (Array.isArray(msg.customEmojis)) {
    msg.customEmojis.forEach(em => {
      if (em.code && em.url) htmlText = htmlText.split(em.code).join(`<img src="${em.url}" class="emote">`);
    });
  }
  if (Array.isArray(msg.twitchEmotes)) {
    msg.twitchEmotes.forEach(em => {
      htmlText = htmlText.split(em.code).join(`<img src="${em.url}" class="emote">`);
    });
  }
  if (msg.extraEmotes && typeof msg.extraEmotes === 'object') {
    htmlText = htmlText.split(/\s+/).map(w => msg.extraEmotes[w] ? `<img src="${msg.extraEmotes[w]}" class="emote">` : w).join(' ');
  }

  let subHTML = '';
  if (showSubBadge.checked && msg.isSubscriber) {
    const badgeImg = msg.subBadgeUrl
      ? `<img src="${msg.subBadgeUrl}" alt="Sub">`
      : defaultSubSvg;
    subHTML = `<div class="sub-box" title="Inscrito">${badgeImg}</div>`;
  }

  msgEl.innerHTML = `
    <div class="top-row">
      <div class="name-box">${msg.username || 'Anônimo'}</div>
      ${showPlatformIcon.checked ? `<div class="logo-box">${iconHTML}</div>` : ''}
      ${subHTML}
    </div>
    <div class="message-box">${htmlText}</div>
  `;

  const activeItems = Array.from(previewContainer.querySelectorAll('.message:not(.leaving)'));
  const max = Math.max(1, parseInt(maxMessages.value, 10) || 7);
  const overflowCount = Math.max(0, (activeItems.length + 1) - max);
  const leavingItems = activeItems.slice(0, overflowCount);
  const stayingItems = activeItems.slice(overflowCount);

  if (immediate) {
    leavingItems.forEach(el => el.remove());
    previewContainer.appendChild(msgEl);
    return;
  }

  const chatRect = previewContainer.getBoundingClientRect();
  const firstRects = new Map();
  stayingItems.forEach(el => firstRects.set(el, el.getBoundingClientRect().top));

  leavingItems.forEach(el => {
    const rect = el.getBoundingClientRect();
    el.classList.add('leaving');
    el.style.transition = 'none';
    el.style.position = 'absolute';
    el.style.top = `${rect.top - chatRect.top}px`;
    el.style.left = `${rect.left - chatRect.left}px`;
    el.style.width = `${rect.width}px`;
    el.style.margin = '0';
    setTimeout(() => {
      if (el.parentNode) el.remove();
    }, 330);
  });

  previewContainer.appendChild(msgEl);

  stayingItems.forEach(el => {
    el.style.transition = 'none';
    el.style.transform = 'none';
  });

  stayingItems.forEach(el => {
    const firstTop = firstRects.get(el);
    const lastTop = el.getBoundingClientRect().top;
    const deltaY = firstTop - lastTop;
    if (Math.abs(deltaY) > 0.5) {
      el.style.transform = `translateY(${deltaY}px)`;
    }
  });

  msgEl.style.transition = 'none';
  msgEl.style.opacity = '0';
  msgEl.style.transform = 'translateY(24px) scale(0.96)';

  void previewContainer.offsetHeight;

  stayingItems.forEach(el => {
    el.style.transition = 'transform 200ms cubic-bezier(0.22, 1, 0.36, 1)';
    el.style.transform = 'translateY(0)';
  });

  msgEl.style.transition = 'transform 200ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease-out';
  msgEl.style.opacity = '1';
  msgEl.style.transform = 'translateY(0) scale(1)';

  const wrapper = previewContainer.parentElement;
  if (wrapper) wrapper.scrollTop = wrapper.scrollHeight;
}

// Seed initial sample messages just like chat.html
function seedInitialPreview() {
  previewContainer.innerHTML = '';
  addPreviewMessage({ username: 'lazari', message: 'Salve galera da Twitch 🔥', platform: 'twitch', isSubscriber: true }, true);
  addPreviewMessage({ username: 'lazari', message: 'Família da Kick chegando pesado 🟢', platform: 'kick', isSubscriber: true }, true);
  addPreviewMessage({ username: 'lazari', message: 'YouTube chat ativado 🚀', platform: 'youtube', isSubscriber: false }, true);
}

// Load config from server
async function loadConfig() {
  try {
    const res = await apiFetch('/api/config');
    const data = await res.json();
    currentConfig = data.config;

    // Se havia backup local das configurações deste usuário e o servidor na nuvem acabou de reiniciar, sincroniza de volta
    const localBackupKey = `multichat_cfg_${getActiveOverlayKey()}`;
    const savedLocalStr = localStorage.getItem(localBackupKey);
    if (savedLocalStr && (!currentConfig.platforms?.twitch?.channel && !currentConfig.platforms?.kick?.channel)) {
      try {
        const parsedBackup = JSON.parse(savedLocalStr);
        if (parsedBackup && parsedBackup.platforms) {
          currentConfig = { ...currentConfig, ...parsedBackup };
          apiFetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentConfig)
          }).catch(() => {});
        }
      } catch (e) {}
    }

    const p = currentConfig.platforms || {};
    twitchEnabled.checked = Boolean(p.twitch?.enabled);
    twitchChannel.value = p.twitch?.channel || '';

    youtubeEnabled.checked = Boolean(p.youtube?.enabled);
    youtubeTarget.value = p.youtube?.channelOrLiveId || '';

    tiktokEnabled.checked = Boolean(p.tiktok?.enabled);
    tiktokUsername.value = p.tiktok?.username || '';

    kickEnabled.checked = Boolean(p.kick?.enabled);
    kickChannel.value = p.kick?.channel || '';

    const s = currentConfig.styles || {};
    bubbleBg.value = s.bubbleBg || '#EDEDED';
    textColor.value = s.textColor || '#000000';
    usernameBg.value = s.usernameBg || '#000000';
    iconStyleSelect.value = s.iconStyle || 'white';
    directionSelect.value = s.direction || 'top-down';
    if (titleSize) titleSize.value = s.titleSize || 13;
    fontSize.value = s.fontSize || 15;
    bubbleRadius.value = s.bubbleRadius || 18;
    fadeTime.value = s.fadeTime ?? 0;
    maxMessages.value = s.maxMessages || 7;
    showPlatformIcon.checked = s.showPlatformIcon !== false;
    showSubBadge.checked = s.showSubBadge !== false;
    soundEnabled.checked = Boolean(s.soundEnabled);
    updateCustomSoundUI(s.customSoundName, s.customSoundUrl);

    updatePreviewCSSVariables();
    seedInitialPreview();

    if (currentConfig.socials) {
      loadSocialsIntoUI(currentConfig.socials);
    } else {
      loadSocialsIntoUI(socialsState);
    }

    if (data.statuses) {
      for (const [plat, st] of Object.entries(data.statuses)) {
        renderStatus(plat, st.state, st.message);
      }
    }
  } catch (err) {
    console.error('Erro ao carregar config:', err);
  }
}

async function saveConfig(showFeedback = true) {
  const payload = {
    platforms: {
      twitch: { enabled: twitchEnabled.checked, channel: twitchChannel.value.trim() },
      youtube: { enabled: youtubeEnabled.checked, channelOrLiveId: youtubeTarget.value.trim() },
      tiktok: { enabled: tiktokEnabled.checked, username: tiktokUsername.value.trim() },
      kick: { enabled: kickEnabled.checked, channel: kickChannel.value.trim() }
    },
    styles: {
      bubbleBg: bubbleBg.value,
      textColor: textColor.value,
      usernameBg: usernameBg.value,
      iconStyle: iconStyleSelect.value,
      direction: directionSelect.value,
      titleSize: titleSize ? parseInt(titleSize.value, 10) : 13,
      fontSize: parseInt(fontSize.value, 10),
      bubbleRadius: parseInt(bubbleRadius.value, 10),
      fadeTime: parseInt(fadeTime.value, 10),
      maxMessages: parseInt(maxMessages.value, 10),
      showPlatformIcon: showPlatformIcon.checked,
      showSubBadge: showSubBadge.checked,
      soundEnabled: soundEnabled.checked
    },
    socials: getSocialsPayloadFromUI()
  };

  try {
    localStorage.setItem(`multichat_cfg_${getActiveOverlayKey()}`, JSON.stringify(payload));
  } catch (e) {}

  try {
    const res = await apiFetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok && showFeedback) {
      showToast('Configurações aplicadas com sucesso!');
    }
  } catch (e) {
    showToast('Erro de comunicação com o servidor');
  }
}

// Presets handler (only for chat presets)
const presets = {
  chathtml: { bubbleBg: '#EDEDED', textColor: '#000000', usernameBg: '#000000', iconStyle: 'white', bubbleRadius: 18, fontSize: 15, fadeTime: 0 },
  creme: { bubbleBg: '#fcf8ea', textColor: '#151515', usernameBg: '#111215', iconStyle: 'colored', bubbleRadius: 20, fontSize: 16, fadeTime: 0 },
  dark: { bubbleBg: '#181b24', textColor: '#f8fafc', usernameBg: '#9146FF', iconStyle: 'white', bubbleRadius: 18, fontSize: 15, fadeTime: 0 },
  kick: { bubbleBg: '#14181d', textColor: '#53FC18', usernameBg: '#000000', iconStyle: 'colored', bubbleRadius: 16, fontSize: 15, fadeTime: 0 }
};

document.querySelectorAll('.preset-btn:not(.soc-preset-btn)').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.preset-btn:not(.soc-preset-btn)').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const p = presets[btn.dataset.preset];
    if (!p) return;

    bubbleBg.value = p.bubbleBg;
    textColor.value = p.textColor;
    usernameBg.value = p.usernameBg;
    iconStyleSelect.value = p.iconStyle;
    bubbleRadius.value = p.bubbleRadius;
    fontSize.value = p.fontSize;
    fadeTime.value = p.fadeTime;

    updatePreviewCSSVariables();
    seedInitialPreview();
    saveConfig(true);
  });
});

// Style live updates
let styleTimer = null;
[bubbleBg, textColor, usernameBg, iconStyleSelect, directionSelect, titleSize, fontSize, bubbleRadius, fadeTime, maxMessages, showPlatformIcon, showSubBadge, soundEnabled].forEach(el => {
  if (!el) return;
  el.addEventListener('input', () => {
    updatePreviewCSSVariables();
    clearTimeout(styleTimer);
    styleTimer = setTimeout(() => saveConfig(false), 250);
  });
  el.addEventListener('change', () => {
    if (el === soundEnabled && soundEnabled.checked) {
      playDashboardSound(true);
    }
    updatePreviewCSSVariables();
    seedInitialPreview();
    saveConfig(false);
  });
});

testSoundBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  playDashboardSound(true);
  showToast('🔊 Efeito sonoro reproduzido!');
});

function updateCustomSoundUI(name, url) {
  activeCustomSoundName = name || null;
  activeCustomSoundUrl = url || null;
  if (!customSoundDropzone) return;

  if (activeCustomSoundUrl && activeCustomSoundName) {
    customSoundDropzone.classList.add('has-custom');
    if (customSoundLabel) customSoundLabel.textContent = `Áudio: ${activeCustomSoundName}`;
    if (customSoundSub) customSoundSub.textContent = 'Áudio personalizado ativo (arraste outro para trocar)';
    if (resetSoundBtn) resetSoundBtn.style.display = 'inline-block';
  } else {
    customSoundDropzone.classList.remove('has-custom');
    if (customSoundLabel) customSoundLabel.textContent = 'Arraste um áudio aqui ou clique';
    if (customSoundSub) customSoundSub.textContent = 'MP3, WAV ou OGG • Atual: Som Padrão (Pop)';
    if (resetSoundBtn) resetSoundBtn.style.display = 'none';
  }
}

function handleAudioFileUpload(file) {
  if (!file) return;
  if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|m4a|webm|aac)$/i.test(file.name)) {
    showToast('Selecione um arquivo de áudio válido (.mp3, .wav, .ogg)');
    return;
  }

  const reader = new FileReader();
  reader.onload = async (ev) => {
    let dataUrl = ev.target.result;
    if (typeof dataUrl === 'string' && !dataUrl.startsWith('data:audio/')) {
      dataUrl = dataUrl.replace(/^data:[^;]+;/, 'data:audio/mpeg;');
    }
    try {
      const res = await apiFetch('/api/sound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          dataUrl
        })
      });
      const data = await res.json();
      if (res.ok && data.styles) {
        soundEnabled.checked = true;
        updateCustomSoundUI(data.styles.customSoundName, data.styles.customSoundUrl);
        playDashboardSound(true);
        showToast(`🎵 Áudio "${file.name}" ativado com sucesso!`);
      } else {
        showToast('Erro ao enviar arquivo de áudio');
      }
    } catch (e) {
      showToast('Falha ao enviar áudio para o servidor');
    }
  };
  reader.readAsDataURL(file);
}

customSoundDropzone?.addEventListener('click', (e) => {
  if (e.target === resetSoundBtn || resetSoundBtn?.contains(e.target)) return;
  customSoundFile?.click();
});

customSoundFile?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) handleAudioFileUpload(file);
  customSoundFile.value = '';
});

customSoundDropzone?.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  customSoundDropzone.classList.add('drag-over');
});

customSoundDropzone?.addEventListener('dragleave', (e) => {
  e.preventDefault();
  e.stopPropagation();
  customSoundDropzone.classList.remove('drag-over');
});

customSoundDropzone?.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  customSoundDropzone.classList.remove('drag-over');
  const file = e.dataTransfer?.files?.[0];
  if (file) handleAudioFileUpload(file);
});

resetSoundBtn?.addEventListener('click', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  try {
    const res = await apiFetch('/api/sound', { method: 'DELETE' });
    if (res.ok) {
      updateCustomSoundUI(null, null);
      playDashboardSound(true);
      showToast('↺ Som padrão (Pop) restaurado!');
    }
  } catch (err) {}
});

// Integrated HEX input sync
[
  { hex: bubbleBgHex, picker: bubbleBg },
  { hex: textColorHex, picker: textColor },
  { hex: usernameBgHex, picker: usernameBg }
].forEach(({ hex, picker }) => {
  if (!hex || !picker) return;
  hex.addEventListener('input', () => {
    let v = hex.value.trim();
    if (v && !v.startsWith('#')) v = '#' + v;
    if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
      picker.value = v.toLowerCase();
      updatePreviewCSSVariables();
      clearTimeout(styleTimer);
      styleTimer = setTimeout(() => saveConfig(false), 250);
    }
  });
  hex.addEventListener('blur', () => {
    hex.value = picker.value.toUpperCase();
  });
});

// Auto-save on platform toggle or Enter
[twitchEnabled, youtubeEnabled, tiktokEnabled, kickEnabled].forEach(el => {
  el.addEventListener('change', () => saveConfig(true));
});

platformsForm.addEventListener('submit', (e) => {
  e.preventDefault();
  saveConfig(true);
});

// Atualiza dinamicamente os links exibidos no painel com o token protegido do usuário logado
function refreshUserOverlayLinks() {
  const chatUrl = getChatOverlayUrl();
  const socialsUrl = getSocialsOverlayUrl();

  const quickCopyCode = quickCopyBox?.querySelector('code');
  if (quickCopyCode) quickCopyCode.textContent = chatUrl;
  const socialsCopyCode = document.querySelector('#socials-copy-box code');
  if (socialsCopyCode) socialsCopyCode.textContent = socialsUrl;
  const webcamSocialsCode = document.getElementById('webcam-socials-url-code');
  if (webcamSocialsCode) webcamSocialsCode.textContent = socialsUrl;

  const socialsDirectOpenLink = document.querySelector('#view-socials .obs-info-box a');
  if (socialsDirectOpenLink) socialsDirectOpenLink.href = socialsUrl;

  const activeLinkEl = document.getElementById('open-active-overlay-link');
  const viewSocialsEl = document.getElementById('view-socials');
  if (activeLinkEl) {
    const isSocialsTab = viewSocialsEl && !viewSocialsEl.classList.contains('hidden-view');
    activeLinkEl.href = isSocialsTab ? socialsUrl : chatUrl;
  }
}
refreshUserOverlayLinks();

// Copy URL handlers
function copyObsUrl() {
  const url = getChatOverlayUrl();
  navigator.clipboard.writeText(url).then(() => {
    showToast('Link do seu Chat OBS copiado!');
  });
}
copyBtn.addEventListener('click', copyObsUrl);
quickCopyBox?.addEventListener('click', copyObsUrl);

clearPreviewBtn?.addEventListener('click', async () => {
  previewContainer.innerHTML = '';
  try {
    await apiFetch('/api/clear', { method: 'POST' });
    showToast('Mensagens limpas da tela!');
  } catch (e) {}
});

// Quick platform test buttons
document.querySelectorAll('.sim-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const platform = btn.dataset.platform;
    await apiFetch('/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform })
    });
  });
});

// Custom message simulator
async function sendCustomSimMessage() {
  const text = customSimMsg.value.trim() || 'Salve família! Live top 🔥';
  const username = customSimUser.value.trim() || (currentUser?.username || 'lazari');
  const platform = customSimPlatform.value;
  const isSubscriber = customSimSub.checked;

  await apiFetch('/api/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      platform,
      username,
      message: text,
      isSubscriber
    })
  });
  customSimMsg.value = '';
}

sendCustomSimBtn?.addEventListener('click', sendCustomSimMessage);
customSimMsg?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendCustomSimMessage();
  }
});

// WebSocket connection (protegido por Cookie HttpOnly mc_sid ou overlayToken)
let wsReconnectTimer = null;
function connectWs() {
  if (!currentUser) return;
  if (ws) {
    try { ws.onclose = null; ws.close(); } catch (e) {}
  }
  clearTimeout(wsReconnectTimer);

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const keyParam = currentUser.overlayToken ? `?key=${encodeURIComponent(currentUser.overlayToken)}` : '';
  ws = new WebSocket(`${protocol}//${window.location.host}/${keyParam}`);

  ws.onopen = () => {
    if (serverStatusText) serverStatusText.textContent = 'Servidor Online';
  };

  ws.onmessage = (event) => {
    try {
      const { type, payload } = JSON.parse(event.data);
      if (type === 'status_update') {
        renderStatus(payload.platform, payload.state, payload.message);
      } else if (type === 'chat_message') {
        addPreviewMessage(payload);
      }
    } catch (e) {}
  };

  ws.onclose = () => {
    if (serverStatusText) serverStatusText.textContent = 'Reconectando...';
    wsReconnectTimer = setTimeout(connectWs, 2000);
  };
}

// ============================================================================
// MÓDULO DE REDES SOCIAIS (OVERLAY SEPARADO /socials — ESTILO GABEPEIXE)
// ============================================================================
const viewChat = document.getElementById('view-chat');
const viewSocials = document.getElementById('view-socials');
const tabBtnChat = document.getElementById('tab-btn-chat');
const tabBtnSocials = document.getElementById('tab-btn-socials');
const openActiveOverlayLink = document.getElementById('open-active-overlay-link');

const copySocialsTopBtn = document.getElementById('copy-socials-top-btn');
const socialsCopyBox = document.getElementById('socials-copy-box');
const copySocialsStageBtn = document.getElementById('copy-socials-stage-btn');
const triggerSocialsAnimBtn = document.getElementById('trigger-socials-anim-btn');

const socialsEditorList = document.getElementById('socials-editor-list');
const addSocialBtn = document.getElementById('add-social-btn');
const saveSocialsBtn = document.getElementById('save-socials-btn');
const previewSocialsContainer = document.getElementById('preview-socials-container');

// Controles de Estilo das Redes
const socPillBg = document.getElementById('soc-pill-bg');
const socPillBgHex = document.getElementById('soc-pill-bg-hex');
const socTextColor = document.getElementById('soc-text-color');
const socTextColorHex = document.getElementById('soc-text-color-hex');
const socIconBg = document.getElementById('soc-icon-bg');
const socIconBgHex = document.getElementById('soc-icon-bg-hex');
const socModeSelect = document.getElementById('soc-mode-select');
const socIconStyleSelect = document.getElementById('soc-icon-style-select');
const socLayoutSelect = document.getElementById('soc-layout-select');
const socFontSize = document.getElementById('soc-font-size');
const socFontSizeVal = document.getElementById('soc-font-size-val');
const socHoldTime = document.getElementById('soc-hold-time');
const socHoldTimeVal = document.getElementById('soc-hold-time-val');
const socIntervalTime = document.getElementById('soc-interval-time');
const socIntervalTimeVal = document.getElementById('soc-interval-time-val');
const socialsCycleBadge = document.getElementById('socials-cycle-badge');

const socialWhiteIcons = {
  ...whiteIcons,
  instagram: `<svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>`,
  twitter: `<svg viewBox="0 0 24 24" fill="#ffffff"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
  discord: `<svg viewBox="0 0 24 24" fill="#ffffff"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>`,
  facebook: `<svg viewBox="0 0 24 24" fill="#ffffff"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`
};

const socialColoredIcons = {
  ...coloredIcons,
  instagram: `<svg viewBox="0 0 24 24" fill="none" stroke="#E1306C" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>`,
  twitter: `<svg viewBox="0 0 24 24" fill="#1DA1F2"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
  discord: `<svg viewBox="0 0 24 24" fill="#5865F2"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>`,
  facebook: `<svg viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`
};

let socialsState = {
  items: [
    { id: 'soc_1', platform: 'youtube', handle: 'gabepeixe', enabled: true },
    { id: 'soc_2', platform: 'instagram', handle: 'gabepeixe', enabled: true },
    { id: 'soc_3', platform: 'tiktok', handle: '@gabepeixetv2', enabled: true }
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
};

let socialsPreviewTimers = [];

function switchStudioTab(tab) {
  if (tab === 'socials') {
    tabBtnChat?.classList.remove('active');
    tabBtnSocials?.classList.add('active');
    viewChat?.classList.add('hidden-view');
    viewSocials?.classList.remove('hidden-view');
    if (openActiveOverlayLink) {
      openActiveOverlayLink.href = getSocialsOverlayUrl();
      openActiveOverlayLink.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg> Abrir /socials`;
    }
    runSocialsPreviewCycle();
  } else {
    tabBtnSocials?.classList.remove('active');
    tabBtnChat?.classList.add('active');
    viewSocials?.classList.add('hidden-view');
    viewChat?.classList.remove('hidden-view');
    if (openActiveOverlayLink) {
      openActiveOverlayLink.href = getChatOverlayUrl();
      openActiveOverlayLink.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg> Abrir Overlay`;
    }
  }
}

tabBtnChat?.addEventListener('click', () => switchStudioTab('chat'));
tabBtnSocials?.addEventListener('click', () => switchStudioTab('socials'));

function copySocialsUrl() {
  const url = getSocialsOverlayUrl();
  navigator.clipboard.writeText(url).then(() => {
    showToast('Link das suas Redes copiado!');
  });
}

copySocialsTopBtn?.addEventListener('click', copySocialsUrl);
socialsCopyBox?.addEventListener('click', copySocialsUrl);
copySocialsStageBtn?.addEventListener('click', copySocialsUrl);

function renderSocialsEditorList() {
  if (!socialsEditorList) return;
  socialsEditorList.innerHTML = '';

  const platformOptions = [
    { value: 'youtube', label: '🔴 YouTube' },
    { value: 'instagram', label: '📸 Instagram' },
    { value: 'tiktok', label: '🎵 TikTok' },
    { value: 'twitch', label: '🟣 Twitch' },
    { value: 'kick', label: '🟢 Kick' },
    { value: 'twitter', label: '🐦 X / Twitter' },
    { value: 'discord', label: '💬 Discord' },
    { value: 'facebook', label: '🔵 Facebook' }
  ];

  socialsState.items.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = `social-edit-card ${item.enabled ? 'active-social' : ''}`;

    const optionsHTML = platformOptions.map(opt =>
      `<option value="${opt.value}" ${item.platform === opt.value ? 'selected' : ''}>${opt.label}</option>`
    ).join('');

    card.innerHTML = `
      <div class="social-edit-top">
        <select class="social-edit-select" data-idx="${idx}">
          ${optionsHTML}
        </select>
        <div class="social-edit-actions">
          <label class="switch" title="Ativar/Desativar esta rede">
            <input type="checkbox" class="social-edit-toggle" data-idx="${idx}" ${item.enabled ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
          <button type="button" class="btn-del-social" data-idx="${idx}" title="Remover rede">✕</button>
        </div>
      </div>
      <input type="text" class="social-edit-input" data-idx="${idx}" value="${item.handle || ''}" placeholder="Ex: @seu_usuario ou nome do canal">
    `;

    socialsEditorList.appendChild(card);
  });

  socialsEditorList.querySelectorAll('.social-edit-select').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const i = Number(e.target.dataset.idx);
      socialsState.items[i].platform = e.target.value;
      runSocialsPreviewCycle();
      saveConfig(false);
    });
  });

  socialsEditorList.querySelectorAll('.social-edit-toggle').forEach(chk => {
    chk.addEventListener('change', (e) => {
      const i = Number(e.target.dataset.idx);
      socialsState.items[i].enabled = e.target.checked;
      renderSocialsEditorList();
      runSocialsPreviewCycle();
      saveConfig(false);
    });
  });

  socialsEditorList.querySelectorAll('.social-edit-input').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const i = Number(e.target.dataset.idx);
      socialsState.items[i].handle = e.target.value;
      const pills = previewSocialsContainer?.querySelectorAll('.social-handle-text');
      const activeIdx = socialsState.items.slice(0, i).filter(x => x.enabled).length;
      if (socialsState.items[i].enabled && pills && pills[activeIdx]) {
        pills[activeIdx].textContent = e.target.value;
      }
    });
    inp.addEventListener('change', () => {
      runSocialsPreviewCycle();
      saveConfig(false);
    });
  });

  socialsEditorList.querySelectorAll('.btn-del-social').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const i = Number(e.currentTarget.dataset.idx);
      socialsState.items.splice(i, 1);
      renderSocialsEditorList();
      runSocialsPreviewCycle();
      saveConfig(true);
    });
  });
}

addSocialBtn?.addEventListener('click', () => {
  socialsState.items.push({
    id: `soc_${Date.now()}`,
    platform: 'instagram',
    handle: '@seu_usuario',
    enabled: true
  });
  renderSocialsEditorList();
  runSocialsPreviewCycle();
  saveConfig(true);
});

saveSocialsBtn?.addEventListener('click', () => {
  runSocialsPreviewCycle();
  saveConfig(true);
});

function updateSocialsCSSVariables() {
  if (!socPillBg) return;
  const root = document.documentElement;
  root.style.setProperty('--soc-pill-bg', socPillBg.value);
  root.style.setProperty('--soc-text-color', socTextColor.value);
  root.style.setProperty('--soc-icon-bg', socIconBg.value);

  const fs = parseInt(socFontSize.value, 10) || 15;
  const ph = Math.round(fs * 2.45);
  root.style.setProperty('--soc-font-size', `${fs}px`);
  root.style.setProperty('--soc-pill-height', `${ph}px`);

  if (socPillBgHex && document.activeElement !== socPillBgHex) socPillBgHex.value = socPillBg.value.toUpperCase();
  if (socTextColorHex && document.activeElement !== socTextColorHex) socTextColorHex.value = socTextColor.value.toUpperCase();
  if (socIconBgHex && document.activeElement !== socIconBgHex) socIconBgHex.value = socIconBg.value.toUpperCase();

  socFontSizeVal.textContent = `${fs}px`;
  socHoldTimeVal.textContent = `${socHoldTime.value}s`;
  socIntervalTimeVal.textContent = `${socIntervalTime.value}s`;

  if (socialsCycleBadge) {
    socialsCycleBadge.textContent = socModeSelect.value === 'always' ? 'SEMPRE VISÍVEL' : 'LOOP ATIVO';
  }

  if (previewSocialsContainer) {
    previewSocialsContainer.classList.toggle('layout-vertical', socLayoutSelect.value === 'vertical');
    previewSocialsContainer.classList.toggle('layout-horizontal', socLayoutSelect.value !== 'vertical');
  }

  [socFontSize, socHoldTime, socIntervalTime].forEach(updateSliderProgress);
}

function getSocialsPayloadFromUI() {
  if (!socPillBg) return socialsState;
  return {
    items: socialsState.items,
    styles: {
      pillBg: socPillBg.value,
      textColor: socTextColor.value,
      iconBg: socIconBg.value,
      mode: socModeSelect.value,
      iconStyle: socIconStyleSelect.value,
      layout: socLayoutSelect.value,
      fontSize: parseInt(socFontSize.value, 10) || 15,
      holdTime: parseInt(socHoldTime.value, 10) || 8,
      intervalTime: parseInt(socIntervalTime.value, 10) || 15
    }
  };
}

function loadSocialsIntoUI(soc) {
  if (!soc) return;
  if (Array.isArray(soc.items) && soc.items.length > 0) {
    socialsState.items = soc.items;
  }
  const st = soc.styles || {};
  socialsState.styles = { ...socialsState.styles, ...st };

  if (socPillBg) {
    socPillBg.value = socialsState.styles.pillBg || '#EDEDED';
    socTextColor.value = socialsState.styles.textColor || '#0F1115';
    socIconBg.value = socialsState.styles.iconBg || '#0F1115';
    socModeSelect.value = socialsState.styles.mode || 'loop';
    socIconStyleSelect.value = socialsState.styles.iconStyle || 'white';
    socLayoutSelect.value = socialsState.styles.layout || 'horizontal';
    socFontSize.value = socialsState.styles.fontSize || 15;
    socHoldTime.value = socialsState.styles.holdTime || 8;
    socIntervalTime.value = socialsState.styles.intervalTime || 15;
  }

  renderSocialsEditorList();
  updateSocialsCSSVariables();
  runSocialsPreviewCycle();
}

function runSocialsPreviewCycle() {
  if (!previewSocialsContainer) return;
  socialsPreviewTimers.forEach(t => clearTimeout(t));
  socialsPreviewTimers = [];

  previewSocialsContainer.innerHTML = '';
  const activeItems = socialsState.items.filter(item => item && item.enabled && item.handle?.trim());
  if (activeItems.length === 0) return;

  const iconMap = socIconStyleSelect?.value === 'colored' ? socialColoredIcons : socialWhiteIcons;

  const pills = activeItems.map(item => {
    const pill = document.createElement('div');
    pill.className = 'social-pill';

    const circle = document.createElement('div');
    circle.className = 'social-icon-circle';
    circle.innerHTML = iconMap[item.platform] || iconMap.youtube;

    const wrap = document.createElement('div');
    wrap.className = 'social-handle-wrap';

    const text = document.createElement('span');
    text.className = 'social-handle-text';
    text.textContent = item.handle.trim();

    wrap.appendChild(text);
    pill.appendChild(circle);
    pill.appendChild(wrap);
    previewSocialsContainer.appendChild(pill);
    return pill;
  });

  const staggerMs = 560;
  const popToExpandMs = 210;

  pills.forEach((pill, index) => {
    const startAt = index * staggerMs;
    socialsPreviewTimers.push(setTimeout(() => {
      pill.classList.add('stage-pop');
    }, startAt));

    socialsPreviewTimers.push(setTimeout(() => {
      pill.classList.add('stage-expand');
    }, startAt + popToExpandMs));
  });

  if (socModeSelect?.value === 'always') return;

  const totalEnterTime = (pills.length - 1) * staggerMs + popToExpandMs + 450;
  const holdMs = Math.max(2, parseInt(socHoldTime?.value, 10) || 8) * 1000;
  const exitStartAt = totalEnterTime + holdMs;

  pills.forEach((pill, index) => {
    const itemExitAt = exitStartAt + index * 180;
    socialsPreviewTimers.push(setTimeout(() => {
      pill.classList.remove('stage-expand');
      pill.classList.add('stage-retract');
    }, itemExitAt));

    socialsPreviewTimers.push(setTimeout(() => {
      pill.classList.remove('stage-pop');
    }, itemExitAt + 340));
  });

  const totalExitTime = exitStartAt + (pills.length - 1) * 180 + 650;
  const intervalMs = Math.max(3, parseInt(socIntervalTime?.value, 10) || 15) * 1000;

  socialsPreviewTimers.push(setTimeout(() => {
    runSocialsPreviewCycle();
  }, totalExitTime + intervalMs));
}

triggerSocialsAnimBtn?.addEventListener('click', async () => {
  runSocialsPreviewCycle();
  try {
    await apiFetch('/api/socials/trigger', { method: 'POST' });
    showToast('Animação disparada no Painel e no OBS!');
  } catch (e) {}
});

const socPresets = {
  gabepeixe: { pillBg: '#EDEDED', textColor: '#0F1115', iconBg: '#0F1115', iconStyle: 'white', fontSize: 15 },
  creme: { pillBg: '#FCF8EA', textColor: '#151515', iconBg: '#111215', iconStyle: 'colored', fontSize: 15 },
  dark: { pillBg: '#181B24', textColor: '#F8FAFC', iconBg: '#9146FF', iconStyle: 'white', fontSize: 15 },
  kick: { pillBg: '#14181D', textColor: '#53FC18', iconBg: '#000000', iconStyle: 'colored', fontSize: 15 }
};

document.querySelectorAll('.soc-preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.soc-preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const p = socPresets[btn.dataset.socPreset];
    if (!p) return;

    socPillBg.value = p.pillBg;
    socTextColor.value = p.textColor;
    socIconBg.value = p.iconBg;
    socIconStyleSelect.value = p.iconStyle;
    socFontSize.value = p.fontSize;

    updateSocialsCSSVariables();
    runSocialsPreviewCycle();
    saveConfig(true);
  });
});

[
  [socPillBg, socPillBgHex],
  [socTextColor, socTextColorHex],
  [socIconBg, socIconBgHex]
].forEach(([colorInput, hexInput]) => {
  if (!colorInput || !hexInput) return;
  hexInput.addEventListener('input', () => {
    let val = hexInput.value.trim();
    if (val && !val.startsWith('#')) val = '#' + val;
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
      colorInput.value = val.toLowerCase();
      updateSocialsCSSVariables();
      saveConfig(false);
    }
  });
  hexInput.addEventListener('blur', () => {
    hexInput.value = colorInput.value.toUpperCase();
  });
});

[socPillBg, socTextColor, socIconBg, socFontSize, socHoldTime, socIntervalTime].forEach(el => {
  if (!el) return;
  el.addEventListener('input', () => {
    updateSocialsCSSVariables();
  });
  el.addEventListener('change', () => {
    runSocialsPreviewCycle();
    saveConfig(true);
  });
});

[socModeSelect, socIconStyleSelect, socLayoutSelect].forEach(el => {
  if (!el) return;
  el.addEventListener('change', () => {
    updateSocialsCSSVariables();
    runSocialsPreviewCycle();
    saveConfig(true);
  });
});

// ============================================================================
// SISTEMA UNIFICADO DE LOGIN, SESSÃO HTTPONLY E OAUTH 2.0 (TWITCH / KICK / GOOGLE)
// ============================================================================
const studioShell = document.getElementById('studio-shell');
const authScreen = document.getElementById('auth-screen');
const authTabLogin = document.getElementById('auth-tab-login');
const authTabRegister = document.getElementById('auth-tab-register');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authErrorBox = document.getElementById('auth-error-box');

const userProfilePill = document.getElementById('user-profile-pill');
const userAvatarImg = document.getElementById('user-avatar-img');
const userProviderBadge = document.getElementById('user-provider-badge');
const userDisplayName = document.getElementById('user-display-name');
const userUidBadge = document.getElementById('user-uid-badge');
const logoutBtn = document.getElementById('logout-btn');

const OAUTH_PROVIDER_NAMES = {
  twitch: 'Twitch',
  kick: 'Kick',
  google: 'Google',
  youtube: 'YouTube Live',
  tiktok: 'TikTok Live'
};

function getOAuthErrorMessage(errorCode, providerKey) {
  const provName = OAUTH_PROVIDER_NAMES[providerKey] || 'Plataforma';
  const upperProv = String(providerKey || 'OAUTH').toUpperCase();

  switch (errorCode) {
    case 'provider_not_configured':
      if (providerKey === 'tiktok') {
        return 'Integração OAuth com TikTok Live aguarda configuração das credenciais oficiais (TIKTOK_CLIENT_KEY e TIKTOK_CLIENT_SECRET) de um app Login Kit em developers.tiktok.com no arquivo .env do servidor.';
      }
      if (providerKey === 'youtube') {
        return 'Integração OAuth com YouTube Live usa as credenciais Google (GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET) no arquivo .env do servidor.';
      }
      return `Integração OAuth com ${provName} aguarda configuração das credenciais oficiais (${upperProv}_CLIENT_ID e ${upperProv}_CLIENT_SECRET) no arquivo .env do servidor.`;
    case 'youtube_api_disabled':
      return 'Ative a API "YouTube Data API v3" no Google Cloud Console (APIs e Serviços > Biblioteca) do seu projeto para vincular seu canal do YouTube Live.';
    case 'youtube_no_channel':
      return 'Nenhum canal do YouTube foi encontrado nesta Conta Google. Crie um canal no YouTube primeiro e tente vincular novamente.';
    case 'access_denied':
      return `Autorização cancelada: você recusou a permissão de acesso no ${provName}.`;
    case 'invalid_state':
      return `Sessão de autorização expirada ou inválida (proteção CSRF). Tente conectar com ${provName} novamente.`;
    case 'invalid_callback':
      return `Retorno de callback inválido recebido de ${provName}.`;
    case 'token_exchange_failed':
      return `Falha ao validar o código de autorização com a API oficial do ${provName}. Verifique Client Secret e Redirect URI.`;
    case 'profile_fetch_failed':
      return `Não foi possível obter os dados de perfil da sua conta ${provName}.`;
    case 'account_already_linked':
      return `Esta conta ${provName} já está vinculada a outro usuário do MultiChat Studio.`;
    case 'session_mismatch':
      return `Sua sessão mudou ou expirou durante a vinculação da conta ${provName}. Faça login novamente.`;
    case 'login_required':
      return 'Acesso restrito: faça login na sua conta para acessar esta página.';
    default:
      return `Falha ao autenticar com ${provName}. Tente novamente ou entre com usuário e senha.`;
  }
}

function showAuthError(msg) {
  if (!authErrorBox) return;
  if (!msg) {
    authErrorBox.classList.add('hidden-view');
    authErrorBox.textContent = '';
  } else {
    authErrorBox.textContent = msg;
    authErrorBox.classList.remove('hidden-view');
  }
}

function setAuthTab(mode) {
  showAuthError('');
  if (mode === 'register') {
    authTabLogin?.classList.remove('active');
    authTabRegister?.classList.add('active');
    loginForm?.classList.add('hidden-view');
    registerForm?.classList.remove('hidden-view');
    document.getElementById('reg-username')?.focus();
  } else {
    authTabRegister?.classList.remove('active');
    authTabLogin?.classList.add('active');
    registerForm?.classList.add('hidden-view');
    loginForm?.classList.remove('hidden-view');
    document.getElementById('login-username')?.focus();
  }
}

authTabLogin?.addEventListener('click', () => setAuthTab('login'));
authTabRegister?.addEventListener('click', () => setAuthTab('register'));

// Botões de Login Oficial OAuth 2.0 / 2.1 (Twitch, Kick, Google)
document.querySelectorAll('.btn-social-auth').forEach(btn => {
  btn.addEventListener('click', () => {
    const provider = btn.dataset.provider || 'twitch';
    showAuthError('');
    window.location.href = `/api/auth/oauth/${encodeURIComponent(provider)}?mode=login`;
  });
});

// Renderiza o painel de Contas Vinculadas (Twitch, Kick, Google, YouTube Live, TikTok Live)
function renderLinkedAccountsUI() {
  if (!currentUser) return;
  const linked = currentUser.linkedAccounts || {};

  if (userUidBadge && currentUser.username) {
    userUidBadge.textContent = `@${currentUser.username}`;
  }

  ['twitch', 'kick', 'google', 'youtube', 'tiktok'].forEach(prov => {
    const itemEl = document.querySelector(`.linked-item[data-provider="${prov}"]`);
    const statusEl = document.getElementById(`linked-status-${prov}`);
    const btnEl = document.getElementById(`btn-link-${prov}`);
    const info = linked[prov];

    if (!statusEl || !btnEl) return;

    if (info) {
      itemEl?.classList.add('is-linked');
      const label = info.displayName || info.username || info.email || info.providerUserId;
      statusEl.textContent = `Vinculada: ${label}`;
      btnEl.textContent = 'Desvincular';
      btnEl.classList.add('btn-unlink');
      btnEl.dataset.action = 'unlink';
    } else {
      itemEl?.classList.remove('is-linked');
      const provCfg = providersConfig?.[prov];
      if (provCfg && provCfg.configured === false) {
        statusEl.textContent = prov === 'tiktok'
          ? 'Requer TIKTOK_CLIENT_KEY no .env'
          : 'Aguardando configuração OAuth (.env)';
      } else if (prov === 'youtube') {
        statusEl.textContent = 'Não vinculada (Conta Google)';
      } else {
        statusEl.textContent = 'Não vinculada';
      }
      btnEl.textContent = 'Vincular';
      btnEl.classList.remove('btn-unlink');
      btnEl.dataset.action = 'link';
    }
  });
}

// Eventos de Vincular / Desvincular Contas OAuth com confirmação explícita
['twitch', 'kick', 'google', 'youtube', 'tiktok'].forEach(prov => {
  const btnEl = document.getElementById(`btn-link-${prov}`);
  if (!btnEl) return;

  btnEl.addEventListener('click', async () => {
    const provName = OAUTH_PROVIDER_NAMES[prov] || prov;
    const action = btnEl.dataset.action || 'link';

    if (action === 'link') {
      const extraHint = prov === 'youtube'
        ? '\n\n(O YouTube Live utiliza a sua Conta Google oficial com permissão de leitura do canal.)'
        : '';
      const confirmed = window.confirm(
        `Deseja vincular sua conta oficial (${provName}) ao seu perfil atual (${currentUser?.displayName || currentUser?.username})?${extraHint}`
      );
      if (!confirmed) return;
      window.location.href = `/api/auth/oauth/${encodeURIComponent(prov)}?mode=link`;
      return;
    }

    // Desvincular conta externa
    const confirmedUnlink = window.confirm(
      `Tem certeza que deseja desvincular sua conta da ${provName} do seu perfil?`
    );
    if (!confirmedUnlink) return;

    btnEl.disabled = true;
    try {
      const res = await apiFetch(`/api/auth/link/${encodeURIComponent(prov)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || `Não foi possível desvincular ${provName}`);
        return;
      }
      currentUser = data.user;
      renderLinkedAccountsUI();
      showToast(`Conta ${provName} desvinculada com sucesso.`);
    } catch (err) {
      showToast('Erro de comunicação ao desvincular conta.');
    } finally {
      btnEl.disabled = false;
    }
  });
});

function applyAuthenticatedSession(user) {
  currentUser = user;

  if (authScreen) authScreen.classList.add('hidden-view');
  if (studioShell) studioShell.classList.remove('hidden-view');

  if (userProfilePill) {
    userProfilePill.style.display = 'inline-flex';
    const providerIcons = { twitch: '🟣', kick: '🟢', google: '🔴', youtube: '▶️', tiktok: '🎵', local: '👤' };
    if (userProviderBadge) userProviderBadge.textContent = providerIcons[user.primaryProvider] || '👤';
    if (userDisplayName) userDisplayName.textContent = user.displayName || user.username;

    if (userAvatarImg) {
      if (user.avatarUrl) {
        userAvatarImg.src = user.avatarUrl;
        userAvatarImg.style.display = 'inline-block';
      } else {
        userAvatarImg.style.display = 'none';
      }
    }
  }

  if (customSimUser) {
    customSimUser.value = user.username || 'streamer';
  }

  renderLinkedAccountsUI();
  refreshUserOverlayLinks();
  loadConfig();
  connectWs();
}

function handleSessionExpired() {
  currentUser = null;
  if (ws) {
    try { ws.onclose = null; ws.close(); } catch (e) {}
  }
  if (studioShell) studioShell.classList.add('hidden-view');
  if (userProfilePill) userProfilePill.style.display = 'none';
  if (authScreen) authScreen.classList.remove('hidden-view');
  showAuthError('Sua sessão expirou. Faça login novamente para continuar.');
}

loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  showAuthError('');
  const username = document.getElementById('login-username')?.value.trim();
  const password = document.getElementById('login-password')?.value || '';

  if (!username || !password) {
    showAuthError('Digite seu usuário/e-mail e sua senha para entrar.');
    return;
  }

  const submitBtn = document.getElementById('login-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Entrando...';
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      showAuthError(data.error || 'Falha no login.');
      return;
    }
    showToast(`Bem-vindo de volta, ${data.user.displayName}!`);
    applyAuthenticatedSession(data.user);
  } catch (err) {
    showAuthError('Erro de comunicação com o servidor.');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '🔐 Entrar no Meu Painel';
    }
  }
});

registerForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  showAuthError('');
  const username = document.getElementById('reg-username')?.value.trim();
  const email = document.getElementById('reg-email')?.value.trim();
  const password = document.getElementById('reg-password')?.value || '';

  if (!username || username.length < 3) {
    showAuthError('O nome de usuário deve ter pelo menos 3 caracteres.');
    document.getElementById('reg-username')?.focus();
    return;
  }
  if (!password || password.length < 6) {
    showAuthError('A senha deve ter pelo menos 6 caracteres por segurança.');
    document.getElementById('reg-password')?.focus();
    return;
  }

  const submitBtn = document.getElementById('register-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Criando conta...';
  }

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, displayName: username, email, password })
    });
    const data = await res.json();
    if (!res.ok) {
      showAuthError(data.error || 'Não foi possível criar a conta.');
      return;
    }
    showToast(`✨ Conta criada com sucesso! Bem-vindo, ${data.user.displayName}!`);
    applyAuthenticatedSession(data.user);
  } catch (err) {
    showAuthError('Erro de comunicação com o servidor.');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '✨ Criar Minha Conta Grátis';
    }
  }
});

logoutBtn?.addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } catch (e) {}
  currentUser = null;
  if (ws) {
    try { ws.onclose = null; ws.close(); } catch (e) {}
  }
  if (studioShell) studioShell.classList.add('hidden-view');
  if (userProfilePill) userProfilePill.style.display = 'none';
  if (authScreen) authScreen.classList.remove('hidden-view');
  showAuthError('');
  showToast('Sessão encerrada com segurança.');
});

async function initAuthAndDashboard() {
  const urlParams = new URLSearchParams(window.location.search);
  const authError = urlParams.get('auth_error');
  const authSuccess = urlParams.get('auth_success');
  const authLinked = urlParams.get('auth_linked');
  const providerParam = urlParams.get('provider');

  // Limpa parâmetros de callback da barra de endereço para evitar loops ao recarregar
  if (authError || authSuccess || authLinked || urlParams.has('login')) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  let pendingErrorMessage = authError ? getOAuthErrorMessage(authError, providerParam) : '';

  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (data.providers) {
      providersConfig = data.providers;
    }

    if (res.ok && data.authenticated && data.user) {
      applyAuthenticatedSession(data.user);

      if (authSuccess) {
        const pName = OAUTH_PROVIDER_NAMES[authSuccess] || authSuccess;
        showToast(`Autenticado via ${pName} com sucesso!`);
      } else if (authLinked) {
        const pName = OAUTH_PROVIDER_NAMES[authLinked] || authLinked;
        showToast(`Conta ${pName} vinculada ao seu perfil!`);
      } else if (pendingErrorMessage) {
        showToast(pendingErrorMessage);
      }
      return;
    }
  } catch (e) {}

  // Se não estiver autenticado, exibe tela de login e eventual mensagem de erro do OAuth
  if (studioShell) studioShell.classList.add('hidden-view');
  if (authScreen) authScreen.classList.remove('hidden-view');
  if (pendingErrorMessage) {
    showAuthError(pendingErrorMessage);
  }
}

initAuthAndDashboard();
