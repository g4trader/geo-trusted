const request = require('supertest');
const app = require('../../src/index');
const geoService = require('../../src/services/geoService');
const { sign } = require('../../src/utils/hmac');

describe('Integration Tests - GeoIP Provider Behavior', () => {
  const originalEnv = process.env;
  let mockProvider;

  beforeEach(() => {
    // Setup test environment
    process.env = {
      ...originalEnv,
      SIG_SECRET: 'test-secret-key',
      LOG_SALT: 'test-log-salt',
      NODE_ENV: 'test',
      ENVIRONMENT: 'production', // Simular produção
      GEOIP_PROVIDER: 'maxmind', // Provider configurado
    };

    // Criar mock provider
    mockProvider = {
      getCountryCode: jest.fn(),
      isReady: jest.fn().mockReturnValue(true),
    };
    
    // Reset provider antes de cada teste
    geoService.setProvider(null);
  });

  afterEach(() => {
    process.env = originalEnv;
    geoService.setProvider(null);
  });

  describe('Provider Mock - BR Country Code', () => {
    it('should return 302 redirect when provider returns BR for Brazilian IP', async () => {
      // Mock provider retorna BR para IP brasileiro
      mockProvider.getCountryCode.mockResolvedValue('BR');
      geoService.setProvider(mockProvider);

      const response = await request(app)
        .get('/click')
        .query({
          ad_id: '123',
          creative_id: '456',
          redirect: 'https://example.com',
        })
        .set('X-Forwarded-For', '200.163.174.71'); // IP brasileiro

      expect(response.status).toBe(302);
      expect(response.headers.location).toBeTruthy();
      expect(response.headers.location).toContain('https://example.com');
      expect(response.headers.location).toContain('ad_id=123');
      expect(response.headers.location).toContain('creative_id=456');
      expect(response.headers.location).toContain('sig=');
      expect(response.headers.location).toContain('ts=');
      expect(response.headers.location).toContain('nonce=');
    });

    it('should return countryCode=BR in /geo/country when provider returns BR', async () => {
      // Mock provider retorna BR para IP brasileiro
      mockProvider.getCountryCode.mockResolvedValue('BR');
      geoService.setProvider(mockProvider);

      const response = await request(app)
        .get('/geo/country')
        .set('X-Forwarded-For', '200.163.174.71'); // IP brasileiro

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        ip: '200.163.174.71',
        countryCode: 'BR',
        isPrivate: false,
        provider: 'maxmind',
        providerReady: true,
        source: 'real',
      });
    });

    it('should log country_detected=BR, decision=allow, reasonCodes in /click', async () => {
      // Mock provider retorna BR
      mockProvider.getCountryCode.mockResolvedValue('BR');
      geoService.setProvider(mockProvider);

      let logOutput = '';
      const originalLog = console.log;
      console.log = jest.fn((...args) => {
        logOutput += args.join(' ') + '\n';
        originalLog(...args);
      });

      await request(app)
        .get('/click')
        .query({
          ad_id: '123',
          creative_id: '456',
          redirect: 'https://example.com',
        })
        .set('X-Forwarded-For', '200.163.174.71');

      console.log = originalLog;

      // Verificar que o log contém as informações necessárias
      const logLines = logOutput.split('\n').filter(line => line.trim());
      const clickLog = logLines.find(line => {
        try {
          const log = JSON.parse(line);
          return log.country_detected === 'BR' && log.decision === 'allow';
        } catch {
          return false;
        }
      });

      expect(clickLog).toBeTruthy();
      const parsedLog = JSON.parse(clickLog);
      expect(parsedLog.country_detected).toBe('BR');
      expect(parsedLog.decision).toBe('allow');
      expect(parsedLog.reasonCodes).toBeDefined();
      expect(Array.isArray(parsedLog.reasonCodes)).toBe(true);
    });
  });

  describe('Provider Mock - Null Country Code (Provider Failure)', () => {
    it('should return 200 HTML when provider returns null (simulating provider failure)', async () => {
      // Mock provider retorna null (simulando falha)
      mockProvider.getCountryCode.mockResolvedValue(null);
      geoService.setProvider(mockProvider);

      const response = await request(app)
        .get('/click')
        .query({
          ad_id: '123',
          creative_id: '456',
          redirect: 'https://example.com',
        })
        .set('X-Forwarded-For', '200.163.174.71');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('Aviso');
      expect(response.text).toContain('Brasil');
    });

    it('should return countryCode=null in /geo/country when provider returns null', async () => {
      // Mock provider retorna null
      mockProvider.getCountryCode.mockResolvedValue(null);
      geoService.setProvider(mockProvider);

      const response = await request(app)
        .get('/geo/country')
        .set('X-Forwarded-For', '200.163.174.71');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        ip: '200.163.174.71',
        countryCode: null,
        isPrivate: false,
        provider: 'maxmind',
        providerReady: true,
        source: 'real',
      });
    });

    it('should log country_detected=null, decision=warn, reasonCodes includes OUT_OF_GEO', async () => {
      // Mock provider retorna null
      mockProvider.getCountryCode.mockResolvedValue(null);
      geoService.setProvider(mockProvider);

      let logOutput = '';
      const originalLog = console.log;
      console.log = jest.fn((...args) => {
        logOutput += args.join(' ') + '\n';
        originalLog(...args);
      });

      await request(app)
        .get('/click')
        .query({
          ad_id: '123',
          creative_id: '456',
          redirect: 'https://example.com',
        })
        .set('X-Forwarded-For', '200.163.174.71');

      console.log = originalLog;

      // Verificar que o log contém as informações necessárias
      const logLines = logOutput.split('\n').filter(line => line.trim());
      const clickLog = logLines.find(line => {
        try {
          const log = JSON.parse(line);
          return log.country_detected === null && log.decision === 'warn';
        } catch {
          return false;
        }
      });

      expect(clickLog).toBeTruthy();
      const parsedLog = JSON.parse(clickLog);
      expect(parsedLog.country_detected).toBe(null);
      expect(parsedLog.decision).toBe('warn');
      expect(parsedLog.reasonCodes).toBeDefined();
      expect(Array.isArray(parsedLog.reasonCodes)).toBe(true);
      expect(parsedLog.reasonCodes).toContain('OUT_OF_GEO');
    });
  });

  describe('Provider Mock - Non-BR Country Code', () => {
    it('should return 200 HTML when provider returns US', async () => {
      // Mock provider retorna US
      mockProvider.getCountryCode.mockResolvedValue('US');
      geoService.setProvider(mockProvider);

      const response = await request(app)
        .get('/click')
        .query({
          ad_id: '123',
          creative_id: '456',
          redirect: 'https://example.com',
        })
        .set('X-Forwarded-For', '8.8.8.8');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('Aviso');
    });

    it('should return countryCode=US in /geo/country when provider returns US', async () => {
      // Mock provider retorna US
      mockProvider.getCountryCode.mockResolvedValue('US');
      geoService.setProvider(mockProvider);

      const response = await request(app)
        .get('/geo/country')
        .set('X-Forwarded-For', '8.8.8.8');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        ip: '8.8.8.8',
        countryCode: 'US',
        isPrivate: false,
        provider: 'maxmind',
        providerReady: true,
        source: 'real',
      });
    });
  });

  describe('Provider Not Configured (No Provider)', () => {
    it('should return 200 HTML when no provider is configured', async () => {
      // Não configurar provider (simula falha de inicialização)
      geoService.setProvider(null);

      const response = await request(app)
        .get('/click')
        .query({
          ad_id: '123',
          creative_id: '456',
          redirect: 'https://example.com',
        })
        .set('X-Forwarded-For', '200.163.174.71');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('Aviso');
    });

    it('should return countryCode=null in /geo/country when no provider is configured', async () => {
      // Não configurar provider
      geoService.setProvider(null);

      const response = await request(app)
        .get('/geo/country')
        .set('X-Forwarded-For', '200.163.174.71');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        ip: '200.163.174.71',
        countryCode: null,
        isPrivate: false,
        provider: null,
        providerReady: false,
        source: 'real',
      });
    });
  });
});

