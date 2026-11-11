const tmi = require('tmi.js');
const axios = require('axios');

class TwitchConnector {
  constructor(onMessage, onStatus) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.client = null;
    this.channel = null;
    this.emotesMap = new Map(); // code -> url (7TV / BTTV / FFZ)
    this.badgesMap = new Map(); // "set_id/version" -> image_url_2x
    this.seenIds = new Set();
  }

  async loadBadgesAndEmotes(channel) {
    this.emotesMap.clear();
    this.badgesMap.clear();

    // 1. Load Global Twitch Badges (IVR API)
    try {
      const resGlobalBadges = await axios.get('https://api.ivr.fi/v2/twitch/badges/global', { timeout: 6000 });
      if (Array.isArray(resGlobalBadges.data)) {
        for (const set of resGlobalBadges.data) {
          if (Array.isArray(set.versions)) {
            for (const ver of set.versions) {
              this.badgesMap.set(`${set.set_id}/${ver.id}`, ver.image_url_2x || ver.image_url_1x);
            }
          }
        }
      }
    } catch (e) {}

    // 2. Load Channel-Specific Twitch Badges
    if (channel) {
      try {
        const resChanBadges = await axios.get(`https://api.ivr.fi/v2/twitch/badges/channel?login=${channel}`, { timeout: 6000 });
        if (Array.isArray(resChanBadges.data)) {
          for (const set of resChanBadges.data) {
            if (Array.isArray(set.versions)) {
              for (const ver of set.versions) {
                this.badgesMap.set(`${set.set_id}/${ver.id}`, ver.image_url_2x || ver.image_url_1x);
              }
            }
          }
        }
      } catch (e) {}
    }

    // 3. Load 7TV Global Emotes
    try {
      const r7g = await axios.get('https://7tv.io/v3/emote-sets/global', { timeout: 5000 });
      if (r7g.data?.emotes) {
        for (const e of r7g.data.emotes) {
          const url = e.data?.host?.url ? `https:${e.data.host.url}/2x.webp` : null;
          if (url) this.emotesMap.set(e.name, url);
        }
      }
    } catch (e) {}

    // 4. Load BTTV Global Emotes
    try {
      const rbttvg = await axios.get('https://api.betterttv.net/3/cached/emotes/global', { timeout: 5000 });
      if (Array.isArray(rbttvg.data)) {
        for (const e of rbttvg.data) {
          this.emotesMap.set(e.code, `https://cdn.betterttv.net/emote/${e.id}/2x`);
        }
      }
    } catch (e) {}

    // 5. Resolve Twitch User ID for Channel 7TV / BTTV / FFZ Emotes
    if (channel) {
      try {
        const userRes = await axios.get(`https://api.ivr.fi/v2/twitch/user?login=${channel}`, { timeout: 5000 });
        const twitchId = userRes.data?.[0]?.id;

        if (twitchId) {
          try {
            const r7c = await axios.get(`https://7tv.io/v3/users/twitch/${twitchId}`, { timeout: 5000 });
            if (r7c.data?.emote_set?.emotes) {
              for (const e of r7c.data.emote_set.emotes) {
                const url = e.data?.host?.url ? `https:${e.data.host.url}/2x.webp` : null;
                if (url) this.emotesMap.set(e.name, url);
              }
            }
          } catch (e) {}

          try {
            const rbttvc = await axios.get(`https://api.betterttv.net/3/cached/users/twitch/${twitchId}`, { timeout: 5000 });
            const allBttv = [...(rbttvc.data?.channelEmotes || []), ...(rbttvc.data?.sharedEmotes || [])];
            for (const e of allBttv) {
              this.emotesMap.set(e.code, `https://cdn.betterttv.net/emote/${e.id}/2x`);
            }
          } catch (e) {}

          try {
            const rffz = await axios.get(`https://api.frankerfacez.com/v1/room/id/${twitchId}`, { timeout: 5000 });
            if (rffz.data?.sets) {
              for (const set of Object.values(rffz.data.sets)) {
                for (const e of (set.emoticons || [])) {
                  const url = e.urls?.['2'] || e.urls?.['1'];
                  if (url) this.emotesMap.set(e.name, url.startsWith('http') ? url : `https:${url}`);
                }
              }
            }
          } catch (e) {}
        }
      } catch (e) {}
    }

    console.log(`[Twitch] Canal #${channel}: ${this.emotesMap.size} emotes e ${this.badgesMap.size} badges carregados.`);
  }

  connect(channel) {
    if (!channel) {
      this.disconnect();
      return;
    }

    const cleanChannel = channel.toLowerCase().replace('#', '').trim();

    // Se já estiver conectado ou conectando ao mesmo canal, não cria outro cliente duplicado!
    if (this.client && this.channel === cleanChannel) {
      return;
    }

    this.disconnect();
    this.channel = cleanChannel;
    this.onStatus?.('twitch', 'connecting', `Conectando a Twitch #${this.channel}...`);

    this.loadBadgesAndEmotes(this.channel);

    const clientInstance = new tmi.Client({
      options: { debug: false },
      connection: {
        reconnect: true,
        secure: true
      },
      channels: [this.channel]
    });

    this.client = clientInstance;

    clientInstance.on('message', (ch, tags, message, self) => {
      // Ignora se este cliente já foi substituído
      if (this.client !== clientInstance) return;
      this.handleMessage(tags, message);
    });

    clientInstance.on('disconnected', (reason) => {
      if (this.client !== clientInstance) return;
      this.onStatus?.('twitch', 'disconnected', `Desconectado: ${reason}`);
    });

    clientInstance.connect().then(() => {
      if (this.client !== clientInstance) {
        try { clientInstance.disconnect(); } catch (e) {}
        return;
      }
      this.onStatus?.('twitch', 'connected', `Conectado ao canal #${this.channel}`);
      console.log(`[Twitch] Conectado com sucesso ao canal #${this.channel}`);
    }).catch(err => {
      if (this.client !== clientInstance) return;
      this.onStatus?.('twitch', 'error', `Erro ao conectar: ${err.message}`);
      console.error('[Twitch] Erro na conexão:', err);
    });
  }

  handleMessage(tags, message) {
    const msgId = tags.id || `twitch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    if (this.seenIds.has(msgId)) return;
    this.seenIds.add(msgId);
    if (this.seenIds.size > 500) {
      const first = this.seenIds.values().next().value;
      this.seenIds.delete(first);
    }

    const isSubscriber = Boolean(
      tags.subscriber ||
      (tags.badges && (tags.badges.subscriber !== undefined || tags.badges.founder !== undefined))
    );
    const isMod = Boolean(tags.mod || (tags.badges && tags.badges.moderator !== undefined));
    const isVip = Boolean(tags.badges && tags.badges.vip !== undefined);
    const isBroadcaster = Boolean(tags.badges && tags.badges.broadcaster !== undefined);

    let subBadgeUrl = null;
    const badgeImages = [];

    if (tags.badges) {
      for (const [setId, version] of Object.entries(tags.badges)) {
        const key = `${setId}/${version}`;
        const url = this.badgesMap.get(key) || this.badgesMap.get(`${setId}/0`) || this.badgesMap.get(`${setId}/1`);
        if (url) {
          badgeImages.push({ type: setId, url });
          if (setId === 'subscriber' || setId === 'founder') {
            subBadgeUrl = url;
          }
        }
      }
    }

    if (isSubscriber && !subBadgeUrl) {
      subBadgeUrl = 'https://static-cdn.jtvnw.net/badges/v1/5d9f2208-5dd8-11e7-8513-2ff4adfae661/2';
    }

    let subMonths = null;
    if (tags['badge-info'] && tags['badge-info'].subscriber) {
      subMonths = parseInt(tags['badge-info'].subscriber, 10) || null;
    } else if (tags.badges && tags.badges.subscriber) {
      subMonths = parseInt(tags.badges.subscriber, 10) || null;
    }

    const twitchEmoteUrls = [];
    if (tags.emotes) {
      for (const [emoteId, positions] of Object.entries(tags.emotes)) {
        for (const pos of positions) {
          const [start, end] = pos.split('-').map(Number);
          const emoteCode = message.substring(start, end + 1);
          twitchEmoteUrls.push({
            code: emoteCode,
            url: `https://static-cdn.jtvnw.net/emoticons/v2/${emoteId}/default/dark/2.0`
          });
        }
      }
    }

    this.onMessage({
      id: msgId,
      platform: 'twitch',
      username: tags['display-name'] || tags.username || 'Anônimo',
      userColor: tags.color || null,
      isSubscriber,
      subMonths,
      subBadgeUrl,
      badges: badgeImages,
      isMod,
      isVip,
      isOwner: isBroadcaster,
      message,
      twitchEmotes: twitchEmoteUrls,
      extraEmotesMap: this.emotesMap,
      timestamp: Date.now()
    });
  }

  disconnect() {
    if (this.client) {
      const oldClient = this.client;
      this.client = null;
      this.channel = null;
      try {
        oldClient.removeAllListeners();
        oldClient.disconnect().catch(() => {});
      } catch (e) {}
    }
  }
}

module.exports = TwitchConnector;
