const crypto = require('crypto');

/**
 * Gera hash SHA-256 de uma string usando salt
 * 
 * @param {string} value - Valor a ser hasheado
 * @param {string} salt - Salt para o hash
 * @returns {string} - Hash em hexadecimal
 */
function hashWithSalt(value, salt) {
  if (!value || !salt) {
    return null;
  }
  const hash = crypto.createHash('sha256');
  hash.update(value + salt);
  return hash.digest('hex');
}

/**
 * Sanitiza mensagem de erro removendo secrets e informações sensíveis
 * 
 * @param {string} message - Mensagem original
 * @returns {string} - Mensagem sanitizada
 */
function sanitizeErrorMessage(message) {
  if (!message) return '';
  
  let sanitized = message;
  
  // Remove possíveis secrets de variáveis de ambiente
  const secrets = [
    process.env.SIG_SECRET,
    process.env.LOG_SALT,
    process.env.GA4_API_SECRET,
  ].filter(Boolean);
  
  secrets.forEach(secret => {
    if (secret) {
      // Substitui secret por placeholder
      sanitized = sanitized.replace(new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[REDACTED]');
    }
  });
  
  // Remove possíveis paths de arquivos sensíveis
  sanitized = sanitized.replace(/\/[^\s]+\.(mmdb|key|pem|env)/gi, '[FILE_PATH]');
  
  return sanitized;
}

/**
 * Sanitiza stack trace removendo informações sensíveis
 * 
 * @param {Error} error - Objeto de erro
 * @returns {string} - Stack trace sanitizado
 */
function sanitizeStackTrace(error) {
  if (!error || !error.stack) return null;
  
  let stack = error.stack;
  
  // Remove paths de arquivos (mantém apenas nome do arquivo)
  stack = stack.replace(/\/[^\s]+(\/[^\s]+\.js)/g, '$1');
  
  // Remove possíveis secrets
  stack = sanitizeErrorMessage(stack);
  
  return stack;
}

/**
 * Logger estruturado que gera JSON por linha
 */
class StructuredLogger {
  constructor() {
    this.salt = process.env.LOG_SALT || '';
  }

  /**
   * Loga evento de click com dados estruturados
   * 
   * @param {Object} data - Dados do evento
   * @param {string} data.ad_id - ID do anúncio
   * @param {string} data.creative_id - ID do creative
   * @param {string} data.country_detected - País detectado
   * @param {string} data.ip - IP do cliente
   * @param {string} data.userAgent - User-Agent
   * @param {string} data.decision - Decisão do fraudEngine
   * @param {string[]} data.reasonCodes - Códigos de motivo
   */
  logClick(data) {
    const {
      ad_id,
      creative_id,
      country_detected,
      ip,
      userAgent,
      decision,
      reasonCodes,
    } = data;

    const logEntry = {
      timestamp: new Date().toISOString(),
      ad_id: ad_id || null,
      creative_id: creative_id || null,
      country_detected: country_detected || null,
      ip_hash: hashWithSalt(ip, this.salt),
      ua_hash: hashWithSalt(userAgent, this.salt),
      decision: decision || null,
      reasonCodes: reasonCodes || [],
    };

    // Output JSON por linha (formato ideal para log aggregation)
    console.log(JSON.stringify(logEntry));
  }

  /**
   * Loga erro de forma padronizada e segura
   * 
   * @param {Error|string} error - Erro ou mensagem de erro
   * @param {Object} context - Contexto adicional do erro
   * @param {string} context.endpoint - Endpoint onde ocorreu o erro
   * @param {string} context.ad_id - ID do anúncio (se aplicável)
   * @param {string} context.creative_id - ID do creative (se aplicável)
   * @param {string} context.ip - IP do cliente (será hasheado)
   * @param {string} context.userAgent - User-Agent (será hasheado)
   */
  logError(error, context = {}) {
    const {
      endpoint,
      ad_id,
      creative_id,
      ip,
      userAgent,
    } = context;

    const errorMessage = error instanceof Error ? error.message : String(error);
    const sanitizedMessage = sanitizeErrorMessage(errorMessage);
    const sanitizedStack = error instanceof Error ? sanitizeStackTrace(error) : null;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      message: sanitizedMessage,
      ...(sanitizedStack && { stack: sanitizedStack }),
      ...(endpoint && { endpoint }),
      ...(ad_id && { ad_id }),
      ...(creative_id && { creative_id }),
      ...(ip && { ip_hash: hashWithSalt(ip, this.salt) }),
      ...(userAgent && { ua_hash: hashWithSalt(userAgent, this.salt) }),
    };

    // Output JSON por linha (formato ideal para log aggregation)
    console.error(JSON.stringify(logEntry));
  }
}

// Exporta instância singleton
const logger = new StructuredLogger();

module.exports = logger;

