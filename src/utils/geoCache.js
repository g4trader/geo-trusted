/**
 * Cache simples em memória para GeoIP
 * Armazena IP → country com TTL
 */
class GeoCache {
  constructor() {
    this.cache = new Map();
    this.defaultTtl = parseInt(process.env.GEOIP_CACHE_TTL || '3600000', 10); // 1 hora padrão
  }

  /**
   * Obtém país do cache
   * 
   * @param {string} ip - Endereço IP
   * @returns {string|null} - Código do país ou null se não encontrado/expirado
   */
  get(ip) {
    const entry = this.cache.get(ip);
    
    if (!entry) {
      return null;
    }

    // Verifica se expirou
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(ip);
      return null;
    }

    return entry.country;
  }

  /**
   * Armazena país no cache
   * 
   * @param {string} ip - Endereço IP
   * @param {string|null} country - Código do país
   * @param {number} ttl - TTL em milissegundos (opcional)
   */
  set(ip, country, ttl = null) {
    const expiresAt = Date.now() + (ttl || this.defaultTtl);
    this.cache.set(ip, {
      country,
      expiresAt,
    });
  }

  /**
   * Remove entrada do cache
   * 
   * @param {string} ip - Endereço IP
   */
  delete(ip) {
    this.cache.delete(ip);
  }

  /**
   * Limpa todo o cache
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Remove entradas expiradas (cleanup)
   */
  cleanup() {
    const now = Date.now();
    for (const [ip, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(ip);
      }
    }
  }

  /**
   * Retorna estatísticas do cache
   * 
   * @returns {Object}
   */
  getStats() {
    const now = Date.now();
    let expired = 0;
    let active = 0;

    for (const entry of this.cache.values()) {
      if (now > entry.expiresAt) {
        expired++;
      } else {
        active++;
      }
    }

    return {
      total: this.cache.size,
      active,
      expired,
    };
  }
}

// Exporta instância singleton
const geoCache = new GeoCache();

// Cleanup automático a cada 5 minutos
setInterval(() => {
  geoCache.cleanup();
}, 5 * 60 * 1000);

module.exports = geoCache;


