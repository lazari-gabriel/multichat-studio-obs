// OBS Social Media Overlay Engine (Estilo Gabepeixe — Pop + Expand Sequencial)

const stage = document.getElementById('socials-stage');
let ws = null;
let cycleTimers = [];

let socialsConfig = {
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

const whiteIcons = {
  youtube: `<svg viewBox="0 0 24 24" fill="#ffffff"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
  instagram: `<svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>`,
  tiktok: `<svg viewBox="0 0 24 24" fill="#ffffff"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>`,
  twitch: `<svg viewBox="0 0 24 24" fill="#ffffff"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0h1.714v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>`,
  kick: `<svg viewBox="0 0 24 24" fill="#ffffff"><path d="M1.333 0h8v5.333H12V2.667h2.667V0h8v8H20v2.667h-2.667v2.666H20V16h2.667v8h-8v-2.667H12v-2.666H9.333V24h-8Z"/></svg>`,
  twitter: `<svg viewBox="0 0 24 24" fill="#ffffff"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
  discord: `<svg viewBox="0 0 24 24" fill="#ffffff"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>`,
  facebook: `<svg viewBox="0 0 24 24" fill="#ffffff"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`
};

const coloredIcons = {
  youtube: `<svg viewBox="0 0 24 24"><path fill="#FF0000" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"/><path fill="#FFFFFF" d="m9.545 15.568 6.273-3.568-6.273-3.568z"/></svg>`,
  instagram: `<svg viewBox="0 0 24 24" fill="none" stroke="#E1306C" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>`,
  tiktok: `<svg viewBox="0 0 24 24"><path fill="#25F4EE" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/><path fill="#FE2C55" d="M16.435 0c.21.68.58 1.32 1.08 1.84 1.12 1.11 2.7 1.62 4.24 1.79v1.5c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93v-.01c-.13-.09-.27-.18-.39-.28-.5-.4-.91-.91-1.2-1.49l.09-1.45z"/></svg>`,
  twitch: `<svg viewBox="0 0 24 24" fill="#9146FF"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0h1.714v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>`,
  kick: `<svg viewBox="0 0 24 24" fill="#53FC18"><path d="M1.333 0h8v5.333H12V2.667h2.667V0h8v8H20v2.667h-2.667v2.666H20V16h2.667v8h-8v-2.667H12v-2.666H9.333V24h-8Z"/></svg>`,
  twitter: `<svg viewBox="0 0 24 24" fill="#1DA1F2"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
  discord: `<svg viewBox="0 0 24 24" fill="#5865F2"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>`,
  facebook: `<svg viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`
};

function clearAllTimers() {
  cycleTimers.forEach(t => clearTimeout(t));
  cycleTimers = [];
}

function getIconSVG(platform, iconStyle) {
  const map = iconStyle === 'colored' ? coloredIcons : whiteIcons;
  return map[platform] || map.youtube;
}

function applySocialStyles(styles) {
  if (!styles) return;
  socialsConfig.styles = { ...socialsConfig.styles, ...styles };

  const root = document.documentElement;
  if (styles.pillBg) root.style.setProperty('--soc-pill-bg', styles.pillBg);
  if (styles.textColor) root.style.setProperty('--soc-text-color', styles.textColor);
  if (styles.iconBg) root.style.setProperty('--soc-icon-bg', styles.iconBg);

  const fontSize = Number(styles.fontSize) || 15;
  const pillHeight = Math.round(fontSize * 2.45);
  root.style.setProperty('--soc-font-size', `${fontSize}px`);
  root.style.setProperty('--soc-pill-height', `${pillHeight}px`);

  if (styles.layout === 'vertical') {
    stage.classList.remove('layout-horizontal');
    stage.classList.add('layout-vertical');
  } else {
    stage.classList.remove('layout-vertical');
    stage.classList.add('layout-horizontal');
  }
}

function buildPillsDOM() {
  stage.innerHTML = '';
  const activeItems = (socialsConfig.items || []).filter(item => item && item.enabled && item.handle?.trim());
  const iconStyle = socialsConfig.styles?.iconStyle || 'white';

  activeItems.forEach(item => {
    const pill = document.createElement('div');
    pill.className = 'social-pill';

    const circle = document.createElement('div');
    circle.className = 'social-icon-circle';
    circle.innerHTML = getIconSVG(item.platform, iconStyle);

    const wrap = document.createElement('div');
    wrap.className = 'social-handle-wrap';

    const text = document.createElement('span');
    text.className = 'social-handle-text';
    text.textContent = item.handle.trim();

    wrap.appendChild(text);
    pill.appendChild(circle);
    pill.appendChild(wrap);
    stage.appendChild(pill);
  });

  return Array.from(stage.querySelectorAll('.social-pill'));
}

function runAnimationCycle() {
  clearAllTimers();
  const pills = buildPillsDOM();
  if (pills.length === 0) return;

  const staggerMs = 560; // Cada rede social inicia logo após a anterior abrir (igual ao vídeo do Gabepeixe)
  const popToExpandMs = 210; // Círculo aparece e em seguida expande o nome

  pills.forEach((pill, index) => {
    const startAt = index * staggerMs;

    // Fase 1: Pop do círculo com o ícone da rede social
    cycleTimers.push(setTimeout(() => {
      pill.classList.add('stage-pop');
    }, startAt));

    // Fase 2: Expansão horizontal revelando o @usuario
    cycleTimers.push(setTimeout(() => {
      pill.classList.add('stage-expand');
    }, startAt + popToExpandMs));
  });

  // Se estiver no modo Sempre Visível, para por aqui (mantém todas abertas)
  if (socialsConfig.styles?.mode === 'always') {
    return;
  }

  // Modo Loop Animado: aguarda o tempo de leitura e recolhe em sequência
  const totalEnterTime = (pills.length - 1) * staggerMs + popToExpandMs + 450;
  const holdMs = Math.max(2, Number(socialsConfig.styles?.holdTime) || 8) * 1000;
  const exitStartAt = totalEnterTime + holdMs;

  pills.forEach((pill, index) => {
    const itemExitAt = exitStartAt + index * 180;

    // Fase 3A: Recolhe o texto de volta para o círculo
    cycleTimers.push(setTimeout(() => {
      pill.classList.remove('stage-expand');
      pill.classList.add('stage-retract');
    }, itemExitAt));

    // Fase 3B: Encolhe o círculo até sumir
    cycleTimers.push(setTimeout(() => {
      pill.classList.remove('stage-pop');
    }, itemExitAt + 340));
  });

  const totalExitTime = exitStartAt + (pills.length - 1) * 180 + 650;
  const intervalMs = Math.max(2, Number(socialsConfig.styles?.intervalTime) || 15) * 1000;

  cycleTimers.push(setTimeout(() => {
    runAnimationCycle();
  }, totalExitTime + intervalMs));
}

function updateSocialsConfig(newSocials) {
  if (!newSocials) return;
  if (Array.isArray(newSocials.items)) {
    socialsConfig.items = newSocials.items;
  }
  if (newSocials.styles) {
    applySocialStyles(newSocials.styles);
  }
  runAnimationCycle();
}

function connectServer() {
  const wsHost = window.location.host || 'localhost:3333';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${wsHost}`;

  try {
    ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const { type, payload } = JSON.parse(event.data);
        if (type === 'init') {
          if (payload.config?.socials) {
            updateSocialsConfig(payload.config.socials);
          } else {
            applySocialStyles(socialsConfig.styles);
            runAnimationCycle();
          }
        } else if (type === 'config_update') {
          if (payload.socials) {
            updateSocialsConfig(payload.socials);
          }
        } else if (type === 'socials_trigger') {
          runAnimationCycle();
        }
      } catch (e) {}
    };

    ws.onclose = () => {
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
