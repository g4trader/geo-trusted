const https = require('https');
const logger = require('../utils/logger');

/**
 * Serviço para integração com Google Analytics 4 Measurement Protocol
 */
class GA4Service {
  constructor() {
    this.measurementId = process.env.GA4_MEASUREMENT_ID;
    this.apiSecret = process.env.GA4_API_SECRET;
    this.endpoint = 'https://www.google-analytics.com/mp/collect';
  }

  /**
   * Gera um pseudo client_id (UUID v4 format)
   * 
   * @returns {string} - Pseudo client_id
   */
  generatePseudoClientId() {
    // Gera UUID v4 simplificado
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Envia evento para GA4 via Measurement Protocol
   * 
   * @param {Object} params - Parâmetros do evento
   * @param {string} params.clientId - Client ID (ou pseudo client_id)
   * @param {string} params.ad_id - ID do anúncio
   * @param {string} params.creative_id - ID do creative
   * @param {string} params.country_detected - País detectado
   * @returns {Promise<void>}
   */
  async sendGa4Event({ clientId, ad_id, creative_id, country_detected }) {
    // Validação de configuração
    if (!this.measurementId || !this.apiSecret) {
      console.warn('[GA4] GA4_MEASUREMENT_ID or GA4_API_SECRET not configured, skipping event');
      return;
    }

    // Montar payload do evento
    const payload = {
      client_id: clientId,
      events: [
        {
          name: 'ad_click_valid',
          params: {
            ad_id,
            creative_id,
          },
        },
      ],
      user_properties: {
        country_detected: {
          value: country_detected,
        },
      },
    };

    // URL do Measurement Protocol
    const url = `${this.endpoint}?measurement_id=${this.measurementId}&api_secret=${this.apiSecret}`;

    try {
      // Enviar requisição POST de forma assíncrona (fire and forget)
      await this._sendRequest(url, payload);
    } catch (error) {
      // Log erro mas não interrompe o fluxo
      logger.logError(error, {
        endpoint: 'ga4Service.sendGa4Event',
        ad_id,
        creative_id,
      });
    }
  }

  /**
   * Envia requisição HTTP POST
   * 
   * @private
   * @param {string} url - URL completa
   * @param {Object} payload - Payload JSON
   * @returns {Promise<void>}
   */
  _sendRequest(url, payload) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const postData = JSON.stringify(payload);

      const options = {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`GA4 API returned status ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(postData);
      req.end();
    });
  }
}

// Exporta instância singleton
const ga4Service = new GA4Service();

module.exports = ga4Service;

