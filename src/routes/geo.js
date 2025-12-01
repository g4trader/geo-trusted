const express = require('express');
const router = express.Router();
const { getClientIp, getRequestContext } = require('../utils/ipUtils');
const geoService = require('../services/geoService');

/**
 * GET /geo/context
 * Retorna o contexto da requisição (IP, headers, etc)
 */
router.get('/context', (req, res) => {
  const context = getRequestContext(req);
  res.json(context);
});

/**
 * GET /geo/country
 * Retorna o código do país baseado no IP
 * Query params:
 *   - debug_country: força um país específico (ex: ?debug_country=BR)
 */
router.get('/country', async (req, res) => {
  const ip = getClientIp(req);
  const options = {
    debug_country: req.query.debug_country,
  };

  try {
    const countryCode = await geoService.getCountryCode(ip, options);
    const providerInfo = geoService.getProviderInfo();
    const environment = process.env.ENVIRONMENT || process.env.NODE_ENV || 'development';
    
    // Determina a source (real ou debug)
    const source = options.debug_country && geoService.debugEnabled ? 'debug' : 'real';
    
    res.json({
      ip,
      countryCode,
      isPrivate: !ip || geoService.isPrivateIp ? geoService.isPrivateIp(ip) : false,
      provider: providerInfo.type,
      providerReady: providerInfo.ready,
      source,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;


