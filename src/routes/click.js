const express = require('express');
const router = express.Router();
const { getRequestContext } = require('../utils/ipUtils');
const geoService = require('../services/geoService');
const fraudEngine = require('../services/fraudEngine');
const ga4Service = require('../services/ga4Service');
const logger = require('../utils/logger');
const { sign } = require('../utils/hmac');

/**
 * Gera um nonce aleatório
 * 
 * @returns {string} - Nonce aleatório
 */
function generateNonce() {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

/**
 * Adiciona parâmetros de query a uma URL
 * 
 * @param {string} url - URL base
 * @param {Object} params - Parâmetros a adicionar
 * @returns {string} - URL com parâmetros
 */
function addQueryParams(url, params) {
  const urlObj = new URL(url);
  Object.keys(params).forEach(key => {
    if (params[key] !== null && params[key] !== undefined) {
      urlObj.searchParams.set(key, params[key]);
    }
  });
  return urlObj.toString();
}

/**
 * GET /click
 * Endpoint principal de click tracking com geolocalização
 * 
 * Query params:
 *   - ad_id: ID do anúncio
 *   - creative_id: ID do creative
 *   - redirect: URL de redirecionamento
 *   - cid: Campaign ID (opcional)
 *   - dsp: DSP ID (opcional)
 *   - debug_country: Força país para desenvolvimento
 */
router.get('/', async (req, res) => {
  try {
    // Ler query params
    const { ad_id, creative_id, redirect, cid, dsp, debug_country } = req.query;

    // Validação básica
    if (!ad_id || !creative_id || !redirect) {
      return res.status(400).json({ 
        error: 'Missing required parameters: ad_id, creative_id, redirect' 
      });
    }

    // Obter contexto da requisição
    const requestContext = getRequestContext(req);
    const ip = requestContext.ip;

    // Obter país via geoService
    const country = await geoService.getCountryCode(ip, { debug_country });

    // Avaliar com fraudEngine
    const fraudContext = {
      country,
      acceptLanguage: requestContext.acceptLanguage,
      userAgent: requestContext.userAgent,
      ip,
    };
    const fraudResult = fraudEngine.evaluate(fraudContext);

    // Log estruturado - SEMPRE inclui country_detected, decision e reasonCodes
    logger.logClick({
      ad_id,
      creative_id,
      country_detected: country || null, // Garantir que sempre está presente (mesmo que null)
      ip,
      userAgent: requestContext.userAgent,
      decision: fraudResult.decision || 'unknown', // Garantir que sempre está presente
      reasonCodes: fraudResult.reasonCodes || [], // Garantir que sempre está presente (array vazio se não houver)
    });

    // Verificar se é BR (ou se decision é 'allow')
    if (country === 'BR' && fraudResult.decision === 'allow') {
      // Determinar client_id: usar cid se disponível, senão gerar pseudo client_id
      let clientId = cid;
      if (!clientId) {
        clientId = ga4Service.generatePseudoClientId();
      }

      // Enviar evento GA4 de forma assíncrona (fire and forget)
      ga4Service.sendGa4Event({
        clientId,
        ad_id,
        creative_id,
        country_detected: country,
      }).catch((error) => {
        // Erro já é logado no ga4Service, apenas garantir que não quebra o fluxo
        logger.logError(error, {
          endpoint: '/click',
          ad_id,
          creative_id,
          ip,
          userAgent: requestContext.userAgent,
        });
      });

      // Gerar timestamp e nonce
      const ts = Date.now();
      const nonce = generateNonce();

      // Gerar assinatura
      const sigSecret = process.env.SIG_SECRET;
      if (!sigSecret) {
        return res.status(500).json({ error: 'SIG_SECRET not configured' });
      }

      const sig = sign({ ad_id, creative_id, ts, nonce }, sigSecret);

      // Set cookie __ad_click=1; SameSite=Lax; Secure
      res.cookie('__ad_click', '1', {
        sameSite: 'Lax',
        secure: process.env.NODE_ENV === 'production', // Secure apenas em produção
        httpOnly: false, // Permitir acesso via JS se necessário
      });

      // Montar URL de redirect com parâmetros
      // Se geramos pseudo client_id, adicionar como cid no redirect
      const redirectParams = {
        ad_id,
        creative_id,
        ts,
        nonce,
        sig,
        ...(cid && { cid }),
        ...(!cid && { cid: clientId }), // Adicionar pseudo client_id se não havia cid
        ...(dsp && { dsp }),
      };

      const redirectUrl = addQueryParams(redirect, redirectParams);

      // Responder 302 Location
      return res.redirect(302, redirectUrl);
    } else {
      // Não é BR ou decision !== 'allow' - mostrar página de aviso informativo
      // IMPORTANTE: NÃO incluir qualquer referência ao redirect no HTML
      // A página é apenas informativa, sem possibilidade de seguir para o anunciante

      // Renderizar página HTML simples com aviso informativo (sem redirect)
      const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aviso</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #333;
    }
    .container {
      background: white;
      padding: 2rem;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      max-width: 500px;
      text-align: center;
    }
    h1 {
      margin-top: 0;
      color: #667eea;
    }
    p {
      line-height: 1.6;
      color: #666;
      margin-bottom: 2rem;
    }
    .button {
      background: #667eea;
      color: white;
      border: none;
      padding: 12px 32px;
      font-size: 16px;
      border-radius: 6px;
      cursor: pointer;
      text-decoration: none;
      display: inline-block;
      transition: background 0.3s;
    }
    .button:hover {
      background: #5568d3;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>⚠️ Aviso</h1>
    <p>Este conteúdo está disponível apenas para usuários no Brasil.</p>
    <p>Por questões de segurança e restrições geográficas, não é possível acessar este conteúdo a partir da sua localização atual.</p>
    <button onclick="window.close()" class="button">Fechar</button>
  </div>
</body>
</html>
      `;

      return res.status(200).send(html);
    }
  } catch (error) {
    logger.logError(error, {
      endpoint: '/click',
      ad_id: req.query.ad_id,
      creative_id: req.query.creative_id,
      ip: getRequestContext(req).ip,
      userAgent: getRequestContext(req).userAgent,
    });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

