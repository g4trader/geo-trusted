/**
 * Extrai o IP do cliente considerando headers de proxy/CDN
 * Ordem de prioridade:
 * 1. x-forwarded-for (primeiro IP)
 * 2. cf-connecting-ip (Cloudflare)
 * 3. x-real-ip
 * 4. req.socket.remoteAddress
 * 
 * @param {express.Request} req - Objeto de requisição do Express
 * @returns {string|null} - IP do cliente ou null se não encontrado
 */
function getClientIp(req) {
  // x-forwarded-for pode conter múltiplos IPs separados por vírgula
  // O primeiro IP é geralmente o IP original do cliente
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    const ips = xForwardedFor.split(',').map(ip => ip.trim());
    if (ips.length > 0 && ips[0]) {
      return ips[0];
    }
  }

  // Cloudflare
  const cfConnectingIp = req.headers['cf-connecting-ip'];
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  // Nginx proxy
  const xRealIp = req.headers['x-real-ip'];
  if (xRealIp) {
    return xRealIp;
  }

  // IP direto da conexão
  if (req.socket && req.socket.remoteAddress) {
    return req.socket.remoteAddress;
  }

  return null;
}

/**
 * Extrai contexto completo da requisição
 * 
 * @param {express.Request} req - Objeto de requisição do Express
 * @returns {Object} - Objeto com ip, userAgent, acceptLanguage, referer
 */
function getRequestContext(req) {
  return {
    ip: getClientIp(req),
    userAgent: req.headers['user-agent'] || null,
    acceptLanguage: req.headers['accept-language'] || null,
    referer: req.headers['referer'] || req.headers['referrer'] || null,
  };
}

module.exports = {
  getClientIp,
  getRequestContext,
};


