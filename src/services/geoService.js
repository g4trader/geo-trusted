const geoCache = require('../utils/geoCache');

/**
 * Verifica se um IP é privado/local
 * 
 * @param {string} ip - Endereço IP
 * @returns {boolean} - true se o IP for privado
 */
function isPrivateIp(ip) {
  if (!ip) return true;

  // Remove IPv6 prefix se presente
  const cleanIp = ip.replace(/^::ffff:/, '');

  // IPv4 privado ranges
  const privateRanges = [
    /^10\./,                    // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
    /^192\.168\./,              // 192.168.0.0/16
    /^127\./,                   // 127.0.0.0/8 (localhost)
    /^169\.254\./,              // 169.254.0.0/16 (link-local)
    /^0\.0\.0\.0$/,             // 0.0.0.0
  ];

  // IPv6 privado/local ranges
  const privateIpv6Ranges = [
    /^::1$/,                    // localhost IPv6
    /^fe80:/,                   // link-local
    /^fc00:/,                   // unique local
    /^fd00:/,                   // unique local
  ];

  // Verifica IPv4 privado
  if (privateRanges.some(range => range.test(cleanIp))) {
    return true;
  }

  // Verifica IPv6 privado
  if (privateIpv6Ranges.some(range => range.test(ip))) {
    return true;
  }

  return false;
}

/**
 * Serviço de geolocalização
 * Interface para obter código do país baseado no IP
 */
class GeoService {
  constructor() {
    // Estrutura para plugar fornecedor real depois (MaxMind, API externa, etc)
    this.provider = null;
    this.cacheEnabled = process.env.GEOIP_CACHE_ENABLED !== 'false'; // Enabled por padrão
    
    // Controla debug_country baseado em ENVIRONMENT flag
    const environment = process.env.ENVIRONMENT || process.env.NODE_ENV || 'development';
    this.debugEnabled = (environment === 'development' || environment === 'staging') && 
                        process.env.ENABLE_DEBUG_COUNTRY !== 'false';
  }

  /**
   * Obtém o código do país baseado no IP
   * 
   * @param {string} ip - Endereço IP
   * @param {Object} options - Opções adicionais (ex: debug_country para mock)
   * @returns {Promise<string|null>} - Código do país (ISO 3166-1 alpha-2) ou null
   */
  async getCountryCode(ip, options = {}) {
    // Mock para desenvolvimento: permite forçar país via query param
    // Desabilitado em produção por padrão
    if (options.debug_country && this.debugEnabled) {
      return options.debug_country.toUpperCase();
    }

    // Se IP privado ou indefinido → retorna null
    if (!ip || isPrivateIp(ip)) {
      return null;
    }

    // Verifica cache primeiro
    if (this.cacheEnabled) {
      const cached = geoCache.get(ip);
      if (cached !== null) {
        return cached;
      }
    }

    // Se houver um provider configurado, usa ele
    let countryCode = null;
    if (this.provider && typeof this.provider.getCountryCode === 'function') {
      countryCode = await this.provider.getCountryCode(ip);
    } else {
      // Provider não configurado - log apenas em produção/staging
      const environment = process.env.ENVIRONMENT || process.env.NODE_ENV || 'development';
      if (environment === 'production' || environment === 'staging') {
        console.warn(`[GeoService] WARNING: No provider configured for IP ${ip}. GeoIP lookup will return null.`);
      }
    }

    // Armazena no cache apenas se countryCode foi retornado (não armazena null)
    if (this.cacheEnabled && countryCode !== null && countryCode !== undefined) {
      geoCache.set(ip, countryCode);
    }

    return countryCode;
  }

  /**
   * Obtém informações sobre o provider atual
   * 
   * @returns {Object} - Informações do provider
   */
  getProviderInfo() {
    if (!this.provider) {
      return {
        type: null,
        ready: false,
      };
    }

    const providerType = process.env.GEOIP_PROVIDER || 'unknown';
    return {
      type: providerType.toLowerCase(),
      ready: this.provider.isReady ? this.provider.isReady() : true,
    };
  }

  /**
   * Configura o provider de geolocalização
   * 
   * @param {Object} provider - Provider com método getCountryCode(ip)
   */
  setProvider(provider) {
    this.provider = provider;
  }
}

// Exporta instância singleton
const geoService = new GeoService();

// Adiciona método isPrivateIp à instância para uso externo
geoService.isPrivateIp = isPrivateIp;

module.exports = geoService;

