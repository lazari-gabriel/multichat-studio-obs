const axios = require('axios');
const https = require('https');

const keepAliveAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 10,
  timeout: 10000
});

class KickConnector {
  constructor(onMessage, onStatus) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.channel = null;
    this.channelId = null;
    this.chatroomId = null;
    this.pollTimer = null;
    this.isActive = false;
    this.isPolling = false;
    this.seenIds = new Set();
    this.isFirstPoll = true;
  }

  async fetchChannelInfo(channel) {
    try {
      const res = await axios.get(`https://kick.com/api/v1/channels/${channel}`, {
        httpsAgent: keepAliveAgent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        },
        timeout: 7000
      });
      if (res.data?.id) {
        return {
          channelId: res.data.id,
          chatroomId: res.data.chatroom?.id || res.data.id
        };
      }
    } catch (e) {
      console.warn('[Kick] Erro ao buscar dados do canal:', e.message);
    }
    return null;
  }

  async connect(channel) {
    if (!channel) {
      this.disconnect();
      return;
    }

    const cleanChannel = channel.toLowerCase().replace('@', '').replace('#', '').trim();

    if (this.isActive && this.channel === cleanChannel && this.channelId) {
      return;
    }

    this.disconnect();
    this.channel = cleanChannel;
    this.isActive = true;
    this.isFirstPoll = true;
    this.seenIds.clear();

    this.onStatus?.('kick', 'connecting', `Conectando à Kick #${this.channel}...`);

    const info = await this.fetchChannelInfo(this.channel);
    if (!this.isActive || this.channel !== cleanChannel) return;

    if (!info || !info.channelId) {
      this.onStatus?.('kick', 'error', `Canal Kick "${this.channel}" não encontrado`);
      return;
    }

    this.channelId = info.channelId;
    this.chatroomId = info.chatroomId;

    this.onStatus?.('kick', 'connected', `Conectado ao chat da Kick (#${this.channel})`);
    console.log(`[Kick] Conectado com sucesso ao canal #${this.channel} (ID: ${this.channelId})`);

    this.runPollLoop();
  }

  async runPollLoop() {
    if (!this.isActive || !this.channelId) return;
    await this.pollMessages();
    if (this.isActive) {
      this.pollTimer = setTimeout(() => this.runPollLoop(), 700);
    }
  }

  async pollMessages() {
    if (!this.isActive || !this.channelId || this.isPolling) return;
    this.isPolling = true;

    try {
      const res = await axios.get(`https://kick.com/api/v2/channels/${this.channelId}/messages`, {
        httpsAgent: keepAliveAgent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        },
        timeout: 4500
      });

      const messages = res.data?.data?.messages;
      if (!Array.isArray(messages)) {
        this.isPolling = false;
        return;
      }

      if (this.isFirstPoll) {
        for (const m of messages) {
          if (m.id) this.seenIds.add(m.id);
        }
        // Emite as últimas 5 mensagens na abertura para o chat já iniciar preenchido e constante
        const initialBatch = messages.slice(0, 5).reverse();
        this.isFirstPoll = false;
        for (const m of initialBatch) {
          this.handleChatMessage(m);
        }
        this.isPolling = false;
        return;
      }

      const newMessages = [];
      for (const m of messages) {
        if (m.id && !this.seenIds.has(m.id)) {
          this.seenIds.add(m.id);
          newMessages.push(m);
        }
      }

      if (this.seenIds.size > 600) {
        const arr = Array.from(this.seenIds).slice(-350);
        this.seenIds = new Set(arr);
      }

      // Ordem cronológica (do mais antigo para o mais recente dentro do lote)
      newMessages.reverse();

      // Em lives gigantes (ex: gabepeixe), limita o lote por ciclo para manter fluxo contínuo em tempo real
      const batchToEmit = newMessages.length > 5 ? newMessages.slice(-5) : newMessages;
      for (const m of batchToEmit) {
        this.handleChatMessage(m);
      }
    } catch (e) {
      // Ignora oscilações momentâneas de rede
    } finally {
      this.isPolling = false;
    }
  }

  handleChatMessage(data) {
    if (!data || !data.content) return;

    const sender = data.sender || {};
    const identity = sender.identity || {};
    const badges = identity.badges || [];
    const badgesV2 = identity.badges_v2 || [];

    const isSubscriber = badges.some(b =>
      b.type === 'subscriber' || b.type === 'sub' || b.type === 'founder'
    );
    const isMod = badges.some(b => b.type === 'moderator' || b.type === 'mod');
    const isOwner = badges.some(b => b.type === 'broadcaster' || b.type === 'owner');
    const isVip = badges.some(b => b.type === 'vip');

    let subBadgeUrl = null;
    const subBadge = badges.find(b => b.type === 'subscriber' || b.type === 'founder');
    if (subBadge?.image?.url) {
      subBadgeUrl = subBadge.image.url;
    } else if (badgesV2.length > 0 && badgesV2[0].image_url) {
      subBadgeUrl = badgesV2[0].image_url;
    }

    let rawText = data.content;
    const customEmojis = [];
    const emoteRegex = /\[emote:(\d+):([^\]]+)\]/g;
    let match;
    while ((match = emoteRegex.exec(data.content)) !== null) {
      const fullToken = match[0];
      const emoteId = match[1];
      const emoteName = match[2];
      customEmojis.push({
        code: fullToken,
        url: `https://files.kick.com/emotes/${emoteId}/fullsize`,
        alt: emoteName
      });
    }

    this.onMessage({
      id: data.id || `kick_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      platform: 'kick',
      username: sender.username || 'KickUser',
      userColor: identity.color || '#53fc18',
      isSubscriber: isSubscriber || Boolean(subBadgeUrl),
      subBadgeUrl,
      isMod,
      isVip,
      isOwner,
      message: rawText,
      customEmojis,
      timestamp: Date.now()
    });
  }

  disconnect() {
    this.isActive = false;
    this.isPolling = false;
    this.channel = null;
    this.channelId = null;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.onStatus?.('kick', 'disconnected', 'Desconectado');
  }
}

module.exports = KickConnector;
