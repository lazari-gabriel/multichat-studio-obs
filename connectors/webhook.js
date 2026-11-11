class WebhookReceiver {
  constructor(onMessage) {
    this.onMessage = onMessage;
  }

  processMessage(body) {
    if (!body) return null;

    // Check for SocialStream Ninja format or direct standard format
    // SocialStream Ninja sends: { type, chatname, chatbadges, chatmessage, hasDonation, type: "twitch" | "youtube" | "kick" ... }
    let platform = (body.platform || body.type || 'stream').toLowerCase();
    if (platform.includes('yt') || platform.includes('youtube')) platform = 'youtube';
    else if (platform.includes('twitch')) platform = 'twitch';
    else if (platform.includes('kick')) platform = 'kick';
    else if (platform.includes('tiktok')) platform = 'tiktok';
    else if (platform.includes('facebook') || platform.includes('fb')) platform = 'facebook';
    else if (platform.includes('trovo')) platform = 'trovo';

    const username = body.username || body.chatname || body.author || 'Viewer';
    const message = body.message || body.chatmessage || body.text || '';
    
    // Subscriber badge check
    let isSubscriber = Boolean(
      body.isSubscriber || 
      body.subscriber || 
      body.isMember || 
      body.membership ||
      (Array.isArray(body.chatbadges) && body.chatbadges.some(b => String(b).toLowerCase().includes('sub') || String(b).toLowerCase().includes('member')))
    );

    let subBadgeUrl = body.subBadgeUrl || body.badgeUrl || null;
    if (!subBadgeUrl && Array.isArray(body.chatbadges)) {
      const badgeImg = body.chatbadges.find(b => typeof b === 'string' && (b.startsWith('http') || b.startsWith('data:image')));
      if (badgeImg) subBadgeUrl = badgeImg;
    }

    const normalized = {
      id: body.id || `wh_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      platform,
      username,
      userAvatar: body.userAvatar || body.avatar || body.chatimg || null,
      userColor: body.userColor || body.color || null,
      isSubscriber,
      subBadgeUrl,
      isMod: Boolean(body.isMod || body.mod),
      isVip: Boolean(body.isVip || body.vip),
      isOwner: Boolean(body.isOwner || body.owner),
      message,
      timestamp: Date.now()
    };

    this.onMessage(normalized);
    return normalized;
  }
}

module.exports = WebhookReceiver;
