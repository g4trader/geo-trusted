const maxmind = require('maxmind');
const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');

/**
 * Provider MaxMind para geolocalização
 * Usa GeoLite2-Country database local
 */
class MaxMindProvider {
  constructor() {
    this.reader = null;
    this.dbPath = process.env.MAXMIND_DB_PATH || path.join(__dirname, '../../data/GeoLite2-Country.mmdb');
    this.initialized = false;
  }

  /**
   * Inicializa o reader do MaxMind
   * 
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // Verifica se o arquivo existe
      if (!fs.existsSync(this.dbPath)) {
        const errorMsg = `Database file not found at ${this.dbPath}`;
        console.error(`[MaxMind] ERROR: ${errorMsg}`);
        console.error('[MaxMind] Please download GeoLite2-Country.mmdb from https://dev.maxmind.com/geoip/geoip2/geolite2/');
        console.error('[MaxMind] Or set MAXMIND_DB_PATH environment variable to point to the database file');
        logger.logError(new Error(errorMsg), { 
          endpoint: 'MaxMindProvider.initialize',
          dbPath: this.dbPath,
        });
        this.initialized = false;
        return;
      }

      // Verifica permissões de leitura
      try {
        fs.accessSync(this.dbPath, fs.constants.R_OK);
      } catch (accessError) {
        const errorMsg = `Database file exists but is not readable: ${this.dbPath}`;
        console.error(`[MaxMind] ERROR: ${errorMsg}`);
        logger.logError(new Error(errorMsg), { 
          endpoint: 'MaxMindProvider.initialize',
          dbPath: this.dbPath,
        });
        this.initialized = false;
        return;
      }

      // Carrega o database
      this.reader = await maxmind.open(this.dbPath);
      this.initialized = true;
      console.log(`[MaxMind] Database loaded successfully from ${this.dbPath}`);
      
      // Testa uma lookup para validar o DB
      try {
        const testLookup = this.reader.get('8.8.8.8');
        if (testLookup && testLookup.country) {
          console.log(`[MaxMind] Database validation successful (test IP: 8.8.8.8 -> ${testLookup.country.iso_code || 'unknown'})`);
        }
      } catch (testError) {
        console.warn(`[MaxMind] Database loaded but test lookup failed: ${testError.message}`);
      }
    } catch (error) {
      const errorMsg = `Failed to load MaxMind database: ${error.message}`;
      console.error(`[MaxMind] ERROR: ${errorMsg}`);
      logger.logError(error, { 
        endpoint: 'MaxMindProvider.initialize',
        dbPath: this.dbPath,
      });
      this.initialized = false;
    }
  }

  /**
   * Obtém o código do país baseado no IP
   * 
   * @param {string} ip - Endereço IP
   * @returns {Promise<string|null>} - Código do país (ISO 3166-1 alpha-2) ou null
   */
  async getCountryCode(ip) {
    if (!this.initialized || !this.reader) {
      await this.initialize();
      if (!this.initialized) {
        console.warn(`[MaxMind] Lookup failed for ${ip}: provider not initialized`);
        return null;
      }
    }

    try {
      const lookup = this.reader.get(ip);
      
      if (lookup && lookup.country && lookup.country.iso_code) {
        return lookup.country.iso_code;
      }

      // IP não encontrado no DB ou sem informação de país
      if (lookup) {
        console.debug(`[MaxMind] IP ${ip} found in DB but no country code available`);
      } else {
        console.debug(`[MaxMind] IP ${ip} not found in database`);
      }
      return null;
    } catch (error) {
      // Log erro mas não quebra o fluxo
      logger.logError(error, { endpoint: 'MaxMindProvider.getCountryCode', ip });
      console.warn(`[MaxMind] Lookup error for ${ip}: ${error.message}`);
      return null;
    }
  }

  /**
   * Verifica se o provider está inicializado e funcionando
   * 
   * @returns {boolean}
   */
  isReady() {
    return this.initialized && this.reader !== null;
  }
}

module.exports = MaxMindProvider;

