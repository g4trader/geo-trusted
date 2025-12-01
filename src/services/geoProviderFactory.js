const HttpProvider = require('./providers/httpProvider');
const logger = require('../utils/logger');

/**
 * Factory para criar providers de geolocalização
 */
class GeoProviderFactory {
  /**
   * Cria e inicializa o provider baseado nas variáveis de ambiente
   * 
   * @returns {Promise<Object|null>} - Provider inicializado ou null
   */
  static async createProvider() {
    const providerType = process.env.GEOIP_PROVIDER || 'maxmind';

    try {
      let provider;

      switch (providerType.toLowerCase()) {
        case 'maxmind':
          try {
            const MaxMindProvider = require('./providers/maxmindProvider');
            provider = new MaxMindProvider();
            console.log(`[GeoProvider] Attempting to initialize MaxMind provider...`);
            console.log(`[GeoProvider] DB path: ${provider.dbPath}`);
            await provider.initialize();
            if (provider.isReady()) {
              console.log('[GeoProvider] MaxMind provider initialized successfully');
              return provider;
            } else {
              logger.logError(new Error('MaxMind provider failed to initialize'), {
                endpoint: 'GeoProviderFactory.createProvider',
                dbPath: provider.dbPath,
              });
              console.error('[GeoProvider] CRITICAL: MaxMind provider failed to initialize');
              console.error('[GeoProvider] This will cause all GeoIP lookups to return null');
              return null;
            }
          } catch (error) {
            logger.logError(error, {
              endpoint: 'GeoProviderFactory.createProvider',
              providerType: 'maxmind',
            });
            console.error('[GeoProvider] CRITICAL: MaxMind module error:', error.message);
            console.error('[GeoProvider] This will cause all GeoIP lookups to return null');
            return null;
          }

        case 'http':
        case 'api':
          provider = new HttpProvider();
          console.log(`[GeoProvider] HTTP provider initialized`);
          console.log(`[GeoProvider] API URL: ${provider.apiUrl}`);
          console.log(`[GeoProvider] API Key: ${provider.apiKey ? 'configured' : 'not configured'}`);
          console.log(`[GeoProvider] Timeout: ${provider.timeout}ms`);
          return provider;

        case 'none':
        case 'stub':
          console.log('[GeoProvider] Using stub provider (no real GeoIP)');
          return null;

        default:
          console.warn(`[GeoProvider] Unknown provider type: ${providerType}, using stub`);
          return null;
      }
    } catch (error) {
      logger.logError(error, { endpoint: 'GeoProviderFactory.createProvider' });
      return null;
    }
  }
}

module.exports = GeoProviderFactory;

