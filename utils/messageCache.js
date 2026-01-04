const crypto = require('crypto');

class MessageCache {
  constructor() {
    this.cache = new Map();
    
    // Nettoyage auto toutes les 10min
    setInterval(() => {
      this.cleanup();
    }, 10 * 60 * 1000);
  }

  // Génère un hash du contenu du message
  hashContent(content) {
    const normalized = content
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' '); // Normalise les espaces multiples
    
    return crypto
      .createHash('md5')
      .update(normalized)
      .digest('hex');
  }

  // Ajoute un message au cache
  addMessage(userId, messageHash, channelId, timestamp, content) {
    const key = `${userId}_${messageHash}`;
    
    if (this.cache.has(key)) {
      const data = this.cache.get(key);
      data.channels.push(channelId);
      data.timestamps.push(timestamp);
    } else {
      this.cache.set(key, {
        content,
        channels: [channelId],
        timestamps: [timestamp],
        level: 0
      });
    }
    
    return this.cache.get(key);
  }

  // Compte les duplicates dans une fenêtre temporelle
  countInWindow(userId, messageHash, windowMs) {
    const key = `${userId}_${messageHash}`;
    const data = this.cache.get(key);
    
    if (!data) return 0;
    
    const now = Date.now();
    const recentTimestamps = data.timestamps.filter(ts => now - ts <= windowMs);
    
    return recentTimestamps.length;
  }

  // Récupère les données d'un message
  getData(userId, messageHash) {
    const key = `${userId}_${messageHash}`;
    return this.cache.get(key);
  }

  // Augmente le niveau de menace
  incrementLevel(userId, messageHash) {
    const key = `${userId}_${messageHash}`;
    const data = this.cache.get(key);
    
    if (data) {
      data.level++;
    }
  }

  // Supprime une entrée du cache
  remove(userId, messageHash) {
    const key = `${userId}_${messageHash}`;
    this.cache.delete(key);
  }

  // Nettoyage des entrées anciennes (>10min)
  cleanup() {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes
    
    for (const [key, data] of this.cache.entries()) {
      const lastTimestamp = data.timestamps[data.timestamps.length - 1];
      
      if (now - lastTimestamp > maxAge) {
        this.cache.delete(key);
      }
    }
    
    console.log(`🧹 Cache nettoyé: ${this.cache.size} entrées restantes`);
  }
}

module.exports = new MessageCache();
