const request = require('supertest');
const app = require('../../src/index');
const { sign } = require('../../src/utils/hmac');

describe('E2E Tests - /click endpoint', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Setup test environment
    process.env = {
      ...originalEnv,
      SIG_SECRET: 'test-secret-key',
      LOG_SALT: 'test-log-salt',
      NODE_ENV: 'test',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Q3.1 - Case country=BR', () => {
    it('should return 302 redirect for BR country', async () => {
      const response = await request(app)
        .get('/click')
        .query({
          ad_id: '123',
          creative_id: '456',
          redirect: 'https://example.com',
          debug_country: 'BR',
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBeTruthy();
    });

    it('should add valid signature to redirect URL', async () => {
      const response = await request(app)
        .get('/click')
        .query({
          ad_id: '123',
          creative_id: '456',
          redirect: 'https://example.com',
          debug_country: 'BR',
        });

      expect(response.status).toBe(302);
      const location = response.headers.location;
      const url = new URL(location);
      
      // Extract params from redirect URL
      const ad_id = url.searchParams.get('ad_id');
      const creative_id = url.searchParams.get('creative_id');
      const ts = url.searchParams.get('ts');
      const nonce = url.searchParams.get('nonce');
      const sig = url.searchParams.get('sig');

      expect(ad_id).toBe('123');
      expect(creative_id).toBe('456');
      expect(ts).toBeTruthy();
      expect(nonce).toBeTruthy();
      expect(sig).toBeTruthy();

      // Verify signature
      const { verifySignature } = require('../../src/utils/hmac');
      const isValid = verifySignature(
        { ad_id, creative_id, ts, nonce },
        sig,
        process.env.SIG_SECRET
      );
      expect(isValid).toBe(true);
    });

    it('should set __ad_click cookie for BR country', async () => {
      const response = await request(app)
        .get('/click')
        .query({
          ad_id: '123',
          creative_id: '456',
          redirect: 'https://example.com',
          debug_country: 'BR',
        });

      expect(response.status).toBe(302);
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeTruthy();
      
      const adClickCookie = cookies.find(cookie => cookie.startsWith('__ad_click=1'));
      expect(adClickCookie).toBeTruthy();
      expect(adClickCookie).toContain('SameSite=Lax');
    });

    it('should include optional params (cid, dsp) in redirect URL', async () => {
      const response = await request(app)
        .get('/click')
        .query({
          ad_id: '123',
          creative_id: '456',
          redirect: 'https://example.com',
          cid: 'campaign-123',
          dsp: 'dsp-456',
          debug_country: 'BR',
        });

      expect(response.status).toBe(302);
      const location = response.headers.location;
      const url = new URL(location);
      
      expect(url.searchParams.get('cid')).toBe('campaign-123');
      expect(url.searchParams.get('dsp')).toBe('dsp-456');
    });
  });

  describe('Q3.2 - Case country!=BR', () => {
    let consoleLogCalls;
    let originalConsoleLog;

    beforeEach(() => {
      consoleLogCalls = [];
      originalConsoleLog = console.log;
      console.log = jest.fn((...args) => {
        consoleLogCalls.push(args.join(' '));
      });
    });

    afterEach(() => {
      console.log = originalConsoleLog;
    });

    it('should return HTML with warning for non-BR country', async () => {
      const response = await request(app)
        .get('/click')
        .query({
          ad_id: '123',
          creative_id: '456',
          redirect: 'https://example.com',
          debug_country: 'US',
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('Aviso');
      expect(response.text).toContain('Brasil');
    });

    it('should log OUT_OF_GEO for non-BR country', async () => {
      await request(app)
        .get('/click')
        .query({
          ad_id: '123',
          creative_id: '456',
          redirect: 'https://example.com',
          debug_country: 'US',
        });

      // Check if OUT_OF_GEO was logged
      const outOfGeoLogs = consoleLogCalls.filter(log => 
        log.includes('OUT_OF_GEO') || 
        (log.includes('"reasonCodes"') && log.includes('OUT_OF_GEO'))
      );
      
      // Should have at least one log entry with OUT_OF_GEO
      expect(consoleLogCalls.length).toBeGreaterThan(0);
      
      // Check structured log format
      const structuredLogs = consoleLogCalls
        .map(log => {
          try {
            return JSON.parse(log);
          } catch {
            return null;
          }
        })
        .filter(log => log !== null);

      const outOfGeoStructured = structuredLogs.find(log => 
        log.reasonCodes && log.reasonCodes.includes('OUT_OF_GEO')
      );
      
      expect(outOfGeoStructured).toBeTruthy();
      expect(outOfGeoStructured.decision).toBe('warn');
    });

    it('should NOT include redirect or continue button in HTML for non-BR country', async () => {
      const response = await request(app)
        .get('/click')
        .query({
          ad_id: '123',
          creative_id: '456',
          redirect: 'https://example.com',
          debug_country: 'US',
        });

      // Verificar que NÃO há botão "Continuar"
      expect(response.text).not.toContain('Continuar');
      
      // Verificar que NÃO há referência à URL de redirect
      expect(response.text).not.toContain('https://example.com');
      expect(response.text).not.toContain('example.com');
      
      // Verificar que NÃO há parâmetros de query do redirect
      expect(response.text).not.toContain('ad_id=123');
      expect(response.text).not.toContain('creative_id=456');
      
      // Verificar que há botão "Fechar" (opcional, mas deve existir)
      expect(response.text).toContain('Fechar');
      
      // Verificar que há mensagem de aviso
      expect(response.text).toContain('Brasil');
      expect(response.text).toContain('Aviso');
    });

    it('should handle null country (private IP) as non-BR', async () => {
      const response = await request(app)
        .get('/click')
        .query({
          ad_id: '123',
          creative_id: '456',
          redirect: 'https://example.com',
          // No debug_country, will use localhost IP which is private
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('Aviso');
    });
  });

  describe('Error handling', () => {
    it('should return 400 for missing required parameters', async () => {
      const response = await request(app)
        .get('/click')
        .query({
          ad_id: '123',
          // Missing creative_id and redirect
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Missing required parameters');
    });

    it('should return 500 if SIG_SECRET is not configured', async () => {
      delete process.env.SIG_SECRET;
      
      const response = await request(app)
        .get('/click')
        .query({
          ad_id: '123',
          creative_id: '456',
          redirect: 'https://example.com',
          debug_country: 'BR',
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('SIG_SECRET');
    });
  });
});


