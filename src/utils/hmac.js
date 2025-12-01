const crypto = require('crypto');

/**
 * Converte base64 para base64url (URL-safe)
 * Substitui + por -, / por _, e remove padding =
 * 
 * @param {string} base64 - String em base64
 * @returns {string} - String em base64url
 */
function base64UrlEncode(base64) {
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Gera assinatura HMAC SHA-256 em base64url
 * 
 * @param {Object} params - Parâmetros a assinar {ad_id, creative_id, ts, nonce}
 * @param {string} secret - Secret para assinatura
 * @returns {string} - Assinatura em base64url
 */
function sign(params, secret) {
  // Ordena os parâmetros para garantir consistência
  const sortedKeys = Object.keys(params).sort();
  const message = sortedKeys
    .map(key => `${key}=${params[key]}`)
    .join('&');

  // Gera HMAC SHA-256
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(message);
  const signature = hmac.digest('base64');

  // Converte para base64url
  return base64UrlEncode(signature);
}

/**
 * Verifica assinatura HMAC
 * 
 * @param {Object} params - Parâmetros a verificar {ad_id, creative_id, ts, nonce}
 * @param {string} sig - Assinatura a verificar (em base64url)
 * @param {string} secret - Secret para verificação
 * @returns {boolean} - true se a assinatura for válida
 */
function verifySignature(params, sig, secret) {
  if (!sig || !secret) {
    return false;
  }

  const expectedSig = sign(params, secret);
  return expectedSig === sig;
}

module.exports = {
  sign,
  verifySignature,
};


