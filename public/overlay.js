// OBS Live Chat Overlay Engine (Fluxo Contínuo & FLIP 60fps — Estilo Gabepeixe)

const chat = document.getElementById('chat');
let ws = null;
let serverConnected = false;
let initializedHistory = false;

let currentConfig = {
  bubbleBg: '#EDEDED',
  textColor: '#000000',
  usernameBg: '#000000',
  usernameColor: '#ffffff',
  titleSize: 13,
  fontSize: 15,
  bubbleRadius: 18,
  maxMessages: 7,
  fadeTime: 0, // 0 = Chat constante: mensagens só saem quando novas chegam no limite
  direction: 'top-down',
  iconStyle: 'white',
  showPlatformIcon: true,
  showSubBadge: true,
  soundEnabled: false,
  soundVolume: 0.5
};

// Ícones Brancos Minimalistas
const whiteIcons = {
  kick: `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" height="12" width="16"><path d="M1.333 0h8v5.333H12V2.667h2.667V0h8v8H20v2.667h-2.667v2.666H20V16h2.667v8h-8v-2.667H12v-2.666H9.333V24h-8Z" fill="#ffffff"></path></svg>`,
  twitch: `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" height="16" width="16"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0h1.714v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" fill="#ffffff"></path></svg>`,
  youtube: `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" height="16" width="16"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="#ffffff"></path></svg>`,
  tiktok: `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" height="16" width="16"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" fill="#ffffff"></path></svg>`
};

// Ícones Coloridos
const coloredIcons = {
  kick: `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" height="12" width="16"><path d="M1.333 0h8v5.333H12V2.667h2.667V0h8v8H20v2.667h-2.667v2.666H20V16h2.667v8h-8v-2.667H12v-2.666H9.333V24h-8Z" fill="#53FC18"></path></svg>`,
  twitch: `<svg viewBox="0 0 24 24" height="16" width="16" fill="#9146FF"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0h1.714v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>`,
  youtube: `<svg viewBox="0 0 24 24" height="16" width="16"><path fill="#FF0000" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"/><path fill="#FFFFFF" d="m9.545 15.568 6.273-3.568-6.273-3.568z"/></svg>`,
  tiktok: `<svg viewBox="0 0 24 24" height="16" width="16"><path fill="#25F4EE" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/><path fill="#FE2C55" d="M16.435 0c.21.68.58 1.32 1.08 1.84 1.12 1.11 2.7 1.62 4.24 1.79v1.5c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93v-.01c-.13-.09-.27-.18-.39-.28-.5-.4-.91-.91-1.2-1.49l.09-1.45z"/></svg>`
};

const defaultSubSvg = `<svg viewBox="0 0 24 24" width="18" height="18"><path fill="#FFD700" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;

function applyStyles(styles) {
  if (!styles) return;
  currentConfig = { ...currentConfig, ...styles };

  const root = document.documentElement;
  if (styles.bubbleBg) root.style.setProperty('--bubble-bg', styles.bubbleBg);
  if (styles.textColor) root.style.setProperty('--text-color', styles.textColor);
  if (styles.usernameBg) root.style.setProperty('--username-bg', styles.usernameBg);
  if (styles.usernameColor) root.style.setProperty('--username-color', styles.usernameColor);
  if (styles.titleSize) root.style.setProperty('--title-size', `${styles.titleSize}px`);
  if (styles.fontSize) root.style.setProperty('--font-size', `${styles.fontSize}px`);
  if (styles.bubbleRadius) root.style.setProperty('--bubble-radius', `${styles.bubbleRadius}px`);

  if (styles.direction === 'bottom-up') {
    chat.classList.remove('direction-top-down');
    chat.classList.add('direction-bottom-up');
  } else {
    chat.classList.remove('direction-bottom-up');
    chat.classList.add('direction-top-down');
  }

  // Se o limite máximo foi reduzido no painel, remove o excesso suavemente
  trimExcessMessagesSmoothly();
}

let audioCtx = null;
let popWavUrl = null;

function getPopWavUrl() {
  if (popWavUrl) return popWavUrl;
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
      const sample = Math.sin(2 * Math.PI * freq * t) * env * 0.75;
      view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 32767, true);
    }
    const blob = new Blob([buffer], { type: 'audio/wav' });
    popWavUrl = URL.createObjectURL(blob);
    return popWavUrl;
  } catch (e) {
    return null;
  }
}

function playPopSound() {
  if (!currentConfig.soundEnabled) return;
  try {
    if (currentConfig.customSoundUrl) {
      const customAudio = new Audio(currentConfig.customSoundUrl);
      customAudio.volume = 0.9;
      customAudio.play().catch(() => {});
      return;
    }
    const url = getPopWavUrl();
    if (url) {
      const audio = new Audio(url);
      audio.volume = 0.85;
      audio.play().catch(() => {});
      return;
    }
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(580, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1020, audioCtx.currentTime + 0.11);
    gain.gain.setValueAtTime(0.55, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.14);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.14);
  } catch (e) {}
}

function parseMessageContent(text, msg) {
  const safeDiv = document.createElement('div');
  safeDiv.textContent = text || '';
  let parsed = safeDiv.innerHTML;

  if (Array.isArray(msg.customEmojis)) {
    for (const em of msg.customEmojis) {
      if (em.code && em.url) {
        parsed = parsed.split(em.code).join(`<img class="emote" src="${em.url}" alt="${em.alt || ''}">`);
      }
    }
  }

  if (Array.isArray(msg.twitchEmotes)) {
    for (const em of msg.twitchEmotes) {
      parsed = parsed.split(em.code).join(`<img class="emote" src="${em.url}" alt="${em.code}">`);
    }
  }

  if (msg.extraEmotes && typeof msg.extraEmotes === 'object') {
    const words = parsed.split(/\s+/);
    parsed = words.map(w => {
      if (msg.extraEmotes[w]) {
        return `<img class="emote" src="${msg.extraEmotes[w]}" alt="${w}">`;
      }
      return w;
    }).join(' ');
  }

  return parsed;
}

function isOnlyEmotesContent(htmlString) {
  if (!htmlString.includes('<img')) return false;
  const stripped = htmlString.replace(/<img[^>]*>/gi, '').trim();
  return stripped.length === 0;
}

function getPlatformIconHTML(platform) {
  const map = currentConfig.iconStyle === 'colored' ? coloredIcons : whiteIcons;
  return map[platform] || map.twitch;
}

// ============================================================================
// FILA CONTÍNUA + MOTOR FLIP 60FPS (Zero Travamento / Deslizamento Fluido)
// ============================================================================
const renderedIds = new Set();
const messageQueue = [];
let isProcessingQueue = false;

function addMessage(msg, immediate = false) {
  if (!msg) return;
  if (msg.id) {
    if (renderedIds.has(msg.id)) return;
    renderedIds.add(msg.id);
    if (renderedIds.size > 600) {
      const first = renderedIds.values().next().value;
      renderedIds.delete(first);
    }
  }

  if (immediate) {
    renderMessageDOM(msg, true);
    return;
  }

  // Mantém a fila enxuta em tempo real (sem atraso em chats rápidos como gabepeixe)
  if (messageQueue.length > 5) {
    messageQueue.splice(0, messageQueue.length - 5);
  }
  messageQueue.push(msg);
  if (!isProcessingQueue) {
    processQueue();
  }
}

function processQueue() {
  if (messageQueue.length === 0) {
    isProcessingQueue = false;
    return;
  }

  isProcessingQueue = true;
  const nextMsg = messageQueue.shift();
  renderMessageDOM(nextMsg, false);

  // Ritmo constante de esteira (210ms por mensagem) igual ao chat do Gabepeixe
  setTimeout(processQueue, 210);
}

function detachAndAnimateOut(el, chatRect) {
  if (!el || el.classList.contains('leaving')) return;
  const rect = el.getBoundingClientRect();
  const topOffset = rect.top - chatRect.top;
  const leftOffset = rect.left - chatRect.left;

  el.classList.add('leaving');
  el.style.transition = 'none';
  el.style.position = 'absolute';
  el.style.top = `${topOffset}px`;
  el.style.left = `${leftOffset}px`;
  el.style.width = `${rect.width}px`;
  el.style.margin = '0';

  setTimeout(() => {
    if (el.parentNode) el.remove();
  }, 205);
}

function trimExcessMessagesSmoothly() {
  const activeItems = Array.from(chat.querySelectorAll('.message:not(.leaving)'));
  const max = Math.max(1, Number(currentConfig.maxMessages) || 7);
  if (activeItems.length <= max) return;

  const overflow = activeItems.length - max;
  const leavingItems = activeItems.slice(0, overflow);
  const stayingItems = activeItems.slice(overflow);

  const chatRect = chat.getBoundingClientRect();
  const firstRects = new Map();
  stayingItems.forEach(el => firstRects.set(el, el.getBoundingClientRect().top));

  leavingItems.forEach(el => detachAndAnimateOut(el, chatRect));

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

  void chat.offsetHeight;

  stayingItems.forEach(el => {
    el.style.transition = 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)';
    el.style.transform = 'translateY(0)';
  });
}

function removeMessageWithFlip(targetEl) {
  if (!targetEl || targetEl.classList.contains('leaving') || !targetEl.parentNode) return;

  const activeItems = Array.from(chat.querySelectorAll('.message:not(.leaving)'));
  const stayingItems = activeItems.filter(el => el !== targetEl);
  const chatRect = chat.getBoundingClientRect();

  const firstRects = new Map();
  stayingItems.forEach(el => firstRects.set(el, el.getBoundingClientRect().top));

  detachAndAnimateOut(targetEl, chatRect);

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

  void chat.offsetHeight;

  stayingItems.forEach(el => {
    el.style.transition = 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)';
    el.style.transform = 'translateY(0)';
  });
}

function renderMessageDOM(msg, immediate = false) {
  if (!immediate) {
    playPopSound();
  }

  const msgEl = document.createElement('div');
  msgEl.className = 'message';

  const topRow = document.createElement('div');
  topRow.className = 'top-row';

  // 1. Campo preto nome (.name-box)
  const nameBox = document.createElement('div');
  nameBox.className = 'name-box';
  nameBox.textContent = msg.username || 'Anônimo';
  topRow.appendChild(nameBox);

  // 2. Campo preto logo (.logo-box)
  if (currentConfig.showPlatformIcon !== false) {
    const logoBox = document.createElement('div');
    logoBox.className = 'logo-box';
    logoBox.innerHTML = getPlatformIconHTML(msg.platform || 'twitch');
    topRow.appendChild(logoBox);
  }

  // 3. Ícone de inscrição (.sub-box) se for inscrito/membro
  if (currentConfig.showSubBadge !== false && msg.isSubscriber) {
    const subBox = document.createElement('div');
    subBox.className = 'sub-box';
    if (msg.subBadgeUrl) {
      subBox.innerHTML = `<img src="${msg.subBadgeUrl}" alt="Sub" onerror="this.outerHTML='${defaultSubSvg.replace(/"/g, '&quot;')}'">`;
    } else {
      subBox.innerHTML = defaultSubSvg;
    }
    topRow.appendChild(subBox);
  }

  // 4. Campo mensagem (.message-box)
  const messageBox = document.createElement('div');
  messageBox.className = 'message-box';
  const htmlContent = parseMessageContent(msg.message, msg);
  if (isOnlyEmotesContent(htmlContent)) {
    messageBox.classList.add('only-emotes');
  }
  messageBox.innerHTML = htmlContent;

  msgEl.appendChild(topRow);
  msgEl.appendChild(messageBox);

  const activeItems = Array.from(chat.querySelectorAll('.message:not(.leaving)'));
  const max = Math.max(1, Number(currentConfig.maxMessages) || 7);
  const overflowCount = Math.max(0, (activeItems.length + 1) - max);
  const leavingItems = activeItems.slice(0, overflowCount);
  const stayingItems = activeItems.slice(overflowCount);

  if (immediate) {
    leavingItems.forEach(el => el.remove());
    chat.appendChild(msgEl);
    return;
  }

  // FLIP Passo 1 (FIRST): salva a posição visual exata de todas as mensagens que vão permanecer
  const chatRect = chat.getBoundingClientRect();
  const firstRects = new Map();
  stayingItems.forEach(el => {
    firstRects.set(el, el.getBoundingClientRect().top);
  });

  // Destaca as mensagens antigas excedentes para saírem suavemente para cima sem travar o fluxo
  leavingItems.forEach(el => detachAndAnimateOut(el, chatRect));

  // Insere a nova mensagem no final
  chat.appendChild(msgEl);

  // FLIP Passo 2 (LAST & INVERT): limpa transforms antigos para medir a posição real do layout novo
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

  // Posição inicial da nova mensagem (entrando de baixo)
  msgEl.style.transition = 'none';
  msgEl.style.opacity = '0';
  msgEl.style.transform = 'translateY(24px) scale(0.96)';

  // Força reflow síncrono único
  void chat.offsetHeight;

  // FLIP Passo 3 (PLAY): todas as mensagens deslizam juntas a 60fps para o topo enquanto a nova entra
  stayingItems.forEach(el => {
    el.style.transition = 'transform 200ms cubic-bezier(0.22, 1, 0.36, 1)';
    el.style.transform = 'translateY(0)';
  });

  msgEl.style.transition = 'transform 200ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease-out';
  msgEl.style.opacity = '1';
  msgEl.style.transform = 'translateY(0) scale(1)';
}

// Conexão WebSocket com o servidor MultiChat (suporta salas individuais via ?key=...)
function connectServer() {
  const wsHost = window.location.host || 'localhost:3333';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const query = window.location.search || '';
  const wsUrl = `${protocol}//${wsHost}/${query}`;

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      serverConnected = true;
      console.log('[Overlay] Conectado ao servidor MultiChat');
    };

    ws.onmessage = (event) => {
      try {
        const { type, payload } = JSON.parse(event.data);
        if (type === 'init') {
          applyStyles(payload.config?.styles);
          if (!initializedHistory && Array.isArray(payload.recentMessages)) {
            initializedHistory = true;
            chat.innerHTML = '';
            const max = Math.max(1, Number(currentConfig.maxMessages) || 7);
            const slice = payload.recentMessages.slice(-max);
            slice.forEach(m => addMessage(m, true));
          }
        } else if (type === 'config_update') {
          applyStyles(payload.styles);
        } else if (type === 'chat_message') {
          addMessage(payload, false);
        } else if (type === 'clear_chat') {
          messageQueue.length = 0;
          chat.innerHTML = '';
        } else if (type === 'unauthorized') {
          window.location.href = '/?login=required';
        }
      } catch (e) {}
    };

    ws.onclose = (ev) => {
      serverConnected = false;
      if (ev && ev.code === 4001) {
        window.location.href = '/?login=required';
        return;
      }
      setTimeout(connectServer, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };
  } catch (e) {
    setTimeout(connectServer, 3000);
  }
}

connectServer();
