const { LiveChat } = require('youtube-chat');

class YouTubeConnector {
  constructor(onMessage, onStatus) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.liveChat = null;
    this.target = null;
    this.isRunning = false;
  }

  // Extract ID or handle from input
  parseInput(input) {
    if (!input) return null;
    input = input.trim();

    // Full URL handling
    if (input.includes('youtube.com/watch?v=')) {
      const match = input.match(/[?&]v=([^&]+)/);
      if (match) return { liveId: match[1] };
    }
    if (input.includes('youtu.be/')) {
      const match = input.match(/youtu\.be\/([^?&]+)/);
      if (match) return { liveId: match[1] };
    }
    if (input.includes('youtube.com/live/')) {
      const match = input.match(/youtube\.com\/live\/([^?&]+)/);
      if (match) return { liveId: match[1] };
    }
    if (input.includes('youtube.com/@') || input.startsWith('@')) {
      const handle = input.replace(/.*youtube\.com\/@?/, '').replace('@', '');
      return { handle: `@${handle}` };
    }
    if (input.startsWith('UC') && input.length >= 20) {
      return { channelId: input };
    }

    // Default: could be live video ID (11 chars) or channel handle
    if (input.length === 11 && !input.startsWith('@')) {
      return { liveId: input };
    }
    return { channelId: input };
  }

  async connect(channelOrLiveId) {
    this.disconnect();
    if (!channelOrLiveId) return;

    this.target = channelOrLiveId;
    const parsed = this.parseInput(channelOrLiveId);
    if (!parsed) return;

    this.onStatus?.('youtube', 'connecting', `Conectando ao YouTube (${JSON.stringify(parsed)})...`);

    try {
      this.liveChat = new LiveChat(parsed);
      this.isRunning = true;

      this.liveChat.on('start', (liveId) => {
        this.onStatus?.('youtube', 'connected', `Conectado à live: ${liveId || 'ativa'}`);
        console.log(`[YouTube] Conectado com sucesso (Live ID: ${liveId})`);
      });

      this.liveChat.on('end', (reason) => {
        this.onStatus?.('youtube', 'disconnected', `Live encerrada: ${reason || 'desconectado'}`);
        this.isRunning = false;
      });

      this.liveChat.on('error', (err) => {
        this.onStatus?.('youtube', 'error', `Erro YouTube: ${err.message}`);
        console.error('[YouTube] Erro no chat:', err);
      });

      this.liveChat.on('chat', (chatItem) => {
        this.handleMessage(chatItem);
      });

      const ok = await this.liveChat.start();
      if (!ok) {
        this.onStatus?.('youtube', 'error', 'Não foi possível encontrar uma transmissão ao vivo com esse canal ou ID.');
      }
    } catch (err) {
      this.onStatus?.('youtube', 'error', `Falha ao iniciar YouTube chat: ${err.message}`);
      console.error('[YouTube] Erro ao iniciar:', err);
    }
  }

  handleMessage(chatItem) {
    if (!chatItem) return;

    // Check membership / subscriber badge
    const isSubscriber = Boolean(chatItem.isMembership || (chatItem.author?.badge && chatItem.author.badge.label?.toLowerCase().includes('member')));
    const isOwner = Boolean(chatItem.isOwner);
    const isMod = Boolean(chatItem.isModerator);
    const subBadgeUrl = chatItem.author?.badge?.thumbnail?.url || null;
    const authorName = chatItem.author?.name || 'YouTube User';

    // Parse message parts (text + custom emojis)
    let fullText = '';
    const inlineEmojis = [];

    if (Array.isArray(chatItem.message)) {
      for (const part of chatItem.message) {
        if (typeof part === 'string') {
          fullText += part;
        } else if (part.text) {
          fullText += part.text;
        } else if (part.url) {
          // Custom YouTube emoji / sticker
          const placeholder = part.emojiText || `[emoji_${inlineEmojis.length}]`;
          fullText += placeholder;
          inlineEmojis.push({
            code: placeholder,
            url: part.url,
            alt: part.alt || placeholder
          });
        }
      }
    } else if (typeof chatItem.message === 'string') {
      fullText = chatItem.message;
    }

    this.onMessage({
      id: chatItem.id || `yt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      platform: 'youtube',
      username: authorName,
      userAvatar: chatItem.author?.thumbnail?.url || null,
      userColor: null,
      isSubscriber,
      subBadgeUrl,
      isMod,
      isVip: false,
      isOwner,
      message: fullText,
      customEmojis: inlineEmojis,
      timestamp: Date.now()
    });
  }

  disconnect() {
    if (this.liveChat && this.isRunning) {
      try {
        this.liveChat.stop();
      } catch (e) {}
      this.liveChat = null;
      this.isRunning = false;
      this.onStatus?.('youtube', 'disconnected', 'Desconectado');
    }
  }
}

module.exports = YouTubeConnector;
