const { TikTokLiveConnection } = require('tiktok-live-connector');

class TikTokConnector {
  constructor(onMessage, onStatus) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.connection = null;
    this.username = null;
  }

  connect(username) {
    this.disconnect();
    if (!username) return;

    this.username = username.replace('@', '').trim();
    this.onStatus?.('tiktok', 'connecting', `Conectando ao TikTok @${this.username}...`);

    try {
      this.connection = new TikTokLiveConnection(this.username, {
        processInitialData: false,
        enableExtendedGiftInfo: false
      });

      this.connection.connect().then(state => {
        this.onStatus?.('tiktok', 'connected', `Conectado à live do TikTok @${this.username} (Room: ${state.roomId})`);
        console.log(`[TikTok] Conectado à sala ${state.roomId}`);
      }).catch(err => {
        this.onStatus?.('tiktok', 'error', `Falha ao conectar TikTok: ${err.message || 'Stream offline ou não encontrada'}`);
        console.error('[TikTok] Erro ao conectar:', err);
      });

      this.connection.on('chat', (data) => {
        this.handleChat(data);
      });

      this.connection.on('disconnected', () => {
        this.onStatus?.('tiktok', 'disconnected', 'Live do TikTok desconectada');
      });

      this.connection.on('streamEnd', () => {
        this.onStatus?.('tiktok', 'disconnected', 'Live do TikTok encerrada');
      });

      this.connection.on('error', (err) => {
        console.error('[TikTok] Erro de evento:', err);
      });

    } catch (err) {
      this.onStatus?.('tiktok', 'error', `Erro TikTok: ${err.message}`);
    }
  }

  handleChat(data) {
    if (!data || !data.comment) return;

    const username = data.nickname || data.uniqueId || 'TikToker';
    const isSubscriber = Boolean(
      data.isSubscriber ||
      (Array.isArray(data.userBadges) && data.userBadges.some(b => b.type?.toLowerCase().includes('sub') || b.badgeSceneType === 4 || b.name?.toLowerCase().includes('sub')))
    );

    let subBadgeUrl = null;
    if (Array.isArray(data.userBadges)) {
      const subBadge = data.userBadges.find(b => b.url || b.image?.url);
      if (subBadge) {
        subBadgeUrl = subBadge.url || subBadge.image?.url;
      }
    }

    this.onMessage({
      id: data.msgId || `tt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      platform: 'tiktok',
      username,
      userAvatar: data.profilePictureUrl || null,
      userColor: null,
      isSubscriber,
      subBadgeUrl,
      isMod: Boolean(data.isModerator),
      isVip: false,
      isOwner: false,
      message: data.comment,
      timestamp: Date.now()
    });
  }

  disconnect() {
    if (this.connection) {
      try {
        this.connection.disconnect();
      } catch (e) {}
      this.connection = null;
      this.onStatus?.('tiktok', 'disconnected', 'Desconectado');
    }
  }
}

module.exports = TikTokConnector;
