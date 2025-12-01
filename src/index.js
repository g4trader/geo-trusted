require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const healthRoutes = require('./routes/health');
const geoRoutes = require('./routes/geo');
const clickRoutes = require('./routes/click');
const geoService = require('./services/geoService');
const GeoProviderFactory = require('./services/geoProviderFactory');

const app = express();
const PORT = process.env.PORT || 3000;

// Inicializar provider de GeoIP em produção/staging
(async () => {
  const environment = process.env.ENVIRONMENT || process.env.NODE_ENV || 'development';
  const providerType = process.env.GEOIP_PROVIDER || 'maxmind';
  
  console.log(`[GeoIP] Environment: ${environment}`);
  console.log(`[GeoIP] Provider type: ${providerType}`);
  
  if (environment === 'production' || environment === 'staging' || process.env.INIT_GEOIP_PROVIDER === 'true') {
    console.log('[GeoIP] Initializing provider...');
    const provider = await GeoProviderFactory.createProvider();
    if (provider) {
      geoService.setProvider(provider);
      console.log(`[GeoIP] Provider initialized successfully: ${providerType}`);
    } else {
      console.error(`[GeoIP] CRITICAL: Provider initialization failed! GeoIP will not work.`);
      console.error(`[GeoIP] Check your configuration:`);
      console.error(`[GeoIP]   - GEOIP_PROVIDER=${providerType}`);
      if (providerType === 'maxmind') {
        console.error(`[GeoIP]   - MAXMIND_DB_PATH=${process.env.MAXMIND_DB_PATH || 'default path'}`);
        console.error(`[GeoIP]   - Ensure GeoLite2-Country.mmdb exists at the specified path`);
      } else if (providerType === 'http' || providerType === 'api') {
        console.error(`[GeoIP]   - GEOIP_API_URL=${process.env.GEOIP_API_URL || 'not set'}`);
        console.error(`[GeoIP]   - GEOIP_API_KEY=${process.env.GEOIP_API_KEY ? 'set' : 'not set'}`);
      }
    }
  } else {
    console.log('[GeoIP] Provider initialization skipped (development mode)');
  }
})();

// Middleware
app.use(express.json());
app.use(cookieParser());

// Routes
app.use('/health', healthRoutes);
app.use('/geo', geoRoutes);
app.use('/click', clickRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({ message: 'Geo Trusted API' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;

