const https = require('https');
const http = require('http');
const logger = require('../../utils/logger');

/**
 * Provider HTTP para geolocalização via API externa
 * Suporta ipapi.co, ipinfo.io, etc.
 */
class HttpProvider {
  constructor() {
    this.apiUrl = process.env.GEOIP_API_URL || 'https://ipapi.co';
    this.apiKey = process.env.GEOIP_API_KEY || null;
    this.timeout = parseInt(process.env.GEOIP_API_TIMEOUT || '2000', 10);
  }

  /**
   * Obtém o código do país baseado no IP via API HTTP
   * 
   * @param {string} ip - Endereço IP
   * @returns {Promise<string|null>} - Código do país (ISO 3166-1 alpha-2) ou null
   */
  async getCountryCode(ip) {
    try {
      const countryCode = await this._fetchCountryCode(ip);
      if (countryCode) {
        console.debug(`[HttpProvider] Lookup successful for ${ip}: ${countryCode}`);
      } else {
        console.debug(`[HttpProvider] Lookup returned null for ${ip}`);
      }
      return countryCode;
    } catch (error) {
      logger.logError(error, { endpoint: 'HttpProvider.getCountryCode', ip });
      console.warn(`[HttpProvider] Lookup error for ${ip}: ${error.message}`);
      return null;
    }
  }

  /**
   * Faz requisição HTTP para obter país
   * 
   * @private
   * @param {string} ip - Endereço IP
   * @returns {Promise<string|null>}
   */
  _fetchCountryCode(ip) {
    return new Promise((resolve, reject) => {
      // Monta URL baseado no provider
      let url;
      if (this.apiUrl.includes('ipapi.co')) {
        url = `${this.apiUrl}/${ip}/country_code/`;
      } else if (this.apiUrl.includes('ipinfo.io')) {
        url = `${this.apiUrl}/${ip}?token=${this.apiKey || ''}`;
      } else {
        // Generic API - assume formato /ip/country
        url = `${this.apiUrl}/${ip}/country`;
      }

      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const client = isHttps ? https : http;

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        timeout: this.timeout,
        headers: {
          'User-Agent': 'GeoTrusted/1.0',
        },
      };

      if (this.apiKey && !urlObj.search.includes('token')) {
        options.headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const req = client.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              // Tenta parsear JSON primeiro
              const json = JSON.parse(data);
              
              // Suporta diferentes formatos de resposta
              let countryCode = json.country_code || json.countryCode || json.country || json.iso_code;
              
              // Se não for JSON, assume que é o código direto
              if (!countryCode && typeof data === 'string') {
                countryCode = data.trim().toUpperCase();
              }

              // Valida que é um código de país válido (2 letras)
              if (countryCode && typeof countryCode === 'string' && countryCode.length === 2) {
                resolve(countryCode.toUpperCase());
              } else {
                console.warn(`[HttpProvider] Invalid country code format received: ${countryCode}`);
                resolve(null);
              }
            } catch (parseError) {
              // Se não for JSON, assume que é o código direto
              const countryCode = data.trim().toUpperCase();
              if (countryCode && countryCode.length === 2) {
                resolve(countryCode);
              } else {
                console.warn(`[HttpProvider] Failed to parse response and invalid direct code: ${data.substring(0, 100)}`);
                resolve(null);
              }
            }
          } else {
            const errorMsg = `API returned status ${res.statusCode}: ${data.substring(0, 200)}`;
            console.error(`[HttpProvider] ${errorMsg}`);
            reject(new Error(errorMsg));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  /**
   * Verifica se o provider está pronto
   * 
   * @returns {boolean}
   */
  isReady() {
    return true; // HTTP provider está sempre "pronto"
  }
}

module.exports = HttpProvider;

