# 🔧 Correção de GeoIP em Produção

## 📋 Problema Identificado

O endpoint `/geo/country` estava retornando `countryCode: null` para IPs brasileiros, causando:
- Geolocalização não funcionando em produção
- Endpoint `/click` retornando 200 HTML (tela de proteção) em vez de 302 redirect para IPs do Brasil

## ✅ Correções Implementadas

### 1. **Melhorias nos Logs de Inicialização**

**Arquivos modificados:**
- `src/index.js`
- `src/services/geoProviderFactory.js`

**Mudanças:**
- Logs detalhados durante inicialização do provider
- Mensagens de erro críticas quando o provider falha
- Informações sobre configuração (DB path, API URL, etc.)
- Avisos claros quando GeoIP não funcionará

**Exemplo de log em produção:**
```
[GeoIP] Environment: production
[GeoIP] Provider type: maxmind
[GeoIP] Initializing provider...
[GeoProvider] Attempting to initialize MaxMind provider...
[GeoProvider] DB path: /app/src/data/GeoLite2-Country.mmdb
[MaxMind] Database loaded successfully from /app/src/data/GeoLite2-Country.mmdb
[MaxMind] Database validation successful (test IP: 8.8.8.8 -> US)
[GeoProvider] MaxMind provider initialized successfully
[GeoIP] Provider initialized successfully: maxmind
```

### 2. **Endpoint `/geo/country` com Informações do Provider**

**Arquivo modificado:**
- `src/routes/geo.js`
- `src/services/geoService.js`

**Mudanças:**
- Resposta agora inclui:
  - `provider`: tipo do provider ("maxmind", "http", ou null)
  - `providerReady`: se o provider está pronto
  - `source`: "real" ou "debug"

**Exemplo de resposta:**
```json
{
  "ip": "200.163.174.71",
  "countryCode": "BR",
  "isPrivate": false,
  "provider": "maxmind",
  "providerReady": true,
  "source": "real"
}
```

### 3. **Melhorias no Tratamento de Erros**

**Arquivos modificados:**
- `src/services/providers/maxmindProvider.js`
- `src/services/providers/httpProvider.js`

**Mudanças:**
- Validação de permissões de leitura do arquivo MaxMind
- Teste de lookup após carregar o DB
- Logs detalhados de erros
- Validação de formato de resposta no HttpProvider
- Logs de debug para troubleshooting

### 4. **Garantia de Logs no `/click`**

**Arquivo modificado:**
- `src/routes/click.js`

**Mudanças:**
- Garantia que `country_detected`, `decision` e `reasonCodes` sempre estão presentes no log
- Valores padrão quando ausentes (null, 'unknown', [])

### 5. **Teste de Integração**

**Arquivo criado:**
- `test/integration/geoProvider.test.js`

**Cobertura:**
- Provider retorna BR → 302 redirect
- Provider retorna null → 200 HTML
- Provider retorna US → 200 HTML
- Provider não configurado → 200 HTML
- Validação de logs estruturados

## 🔍 Como Verificar em Produção

### 1. Verificar Variáveis de Ambiente no Cloud Run

Execute no Cloud Run ou via gcloud:

```bash
gcloud run services describe geo-trusted --region=us-central1 --format="value(spec.template.spec.containers[0].env)"
```

**Variáveis esperadas:**
- `ENVIRONMENT=production`
- `GEOIP_PROVIDER=maxmind` ou `GEOIP_PROVIDER=http`
- Se MaxMind:
  - `MAXMIND_DB_PATH=/app/src/data/GeoLite2-Country.mmdb` (ou caminho correto)
- Se HTTP:
  - `GEOIP_API_URL=https://ipapi.co` (ou outro serviço)
  - `GEOIP_API_KEY=<key>` (se necessário)
  - `GEOIP_API_TIMEOUT=2000` (opcional)

### 2. Verificar Logs de Inicialização

Procure nos logs do Cloud Run por:
- `[GeoIP] Provider initialized successfully` → ✅ OK
- `[GeoIP] CRITICAL: Provider initialization failed!` → ❌ PROBLEMA

### 3. Testar Endpoint `/geo/country`

```bash
curl https://seu-dominio.com/geo/country \
  -H "X-Forwarded-For: 200.163.174.71"
```

**Resposta esperada:**
```json
{
  "ip": "200.163.174.71",
  "countryCode": "BR",
  "isPrivate": false,
  "provider": "maxmind",
  "providerReady": true,
  "source": "real"
}
```

**Se `countryCode` for `null`:**
- Verificar `provider`: se for `null`, o provider não foi inicializado
- Verificar `providerReady`: se for `false`, o provider falhou
- Verificar logs para mensagens de erro

### 4. Testar Endpoint `/click`

```bash
curl -I "https://seu-dominio.com/click?ad_id=123&creative_id=456&redirect=https://example.com" \
  -H "X-Forwarded-For: 200.163.174.71"
```

**Resposta esperada:**
```
HTTP/2 302
Location: https://example.com?ad_id=123&creative_id=456&ts=...&nonce=...&sig=...
Set-Cookie: __ad_click=1; SameSite=Lax; Secure
```

**Se retornar 200 HTML:**
- Verificar logs para `country_detected` e `decision`
- Se `country_detected` for `null`, o provider não está funcionando

## 🛠️ Soluções para Problemas Comuns

### Problema: Provider não inicializa (provider: null)

**Causas possíveis:**
1. `GEOIP_PROVIDER` não está configurado ou está como "stub"
2. MaxMind: arquivo DB não existe no caminho especificado
3. MaxMind: permissões de leitura insuficientes
4. HttpProvider: API URL inválida ou timeout

**Solução:**
1. Verificar `GEOIP_PROVIDER=maxmind` ou `GEOIP_PROVIDER=http`
2. Para MaxMind: garantir que `GeoLite2-Country.mmdb` está no container
3. Para HTTP: testar a API externa manualmente

### Problema: Provider inicializa mas retorna null

**Causas possíveis:**
1. MaxMind: DB corrompido ou desatualizado
2. HttpProvider: API retornando erro ou formato inválido
3. IP não encontrado no DB

**Solução:**
1. Verificar logs de lookup (`[MaxMind] Lookup error` ou `[HttpProvider] Lookup error`)
2. Testar com IP conhecido (ex: 8.8.8.8 → US)
3. Atualizar DB MaxMind ou trocar API HTTP

## 📝 Commit Message Sugerida

```
fix: corrigir geolocalização em produção com melhorias de observabilidade

- Adicionar logs detalhados de inicialização do provider
- Incluir informações de provider no endpoint /geo/country
- Melhorar tratamento de erros nos providers MaxMind e HTTP
- Garantir logs estruturados sempre incluem country_detected, decision e reasonCodes
- Adicionar teste de integração para validar comportamento com provider mockado

Provider habilitado: maxmind (ou http, conforme configurado)
Problema raiz: provider não estava sendo inicializado corretamente ou falhava silenciosamente
```

## 🧪 Exemplos de Teste

### Exemplo 1: IP Brasileiro com Provider Funcionando

**Request:**
```bash
curl https://seu-dominio.com/geo/country \
  -H "X-Forwarded-For: 200.163.174.71"
```

**Response:**
```json
{
  "ip": "200.163.174.71",
  "countryCode": "BR",
  "isPrivate": false,
  "provider": "maxmind",
  "providerReady": true,
  "source": "real"
}
```

### Exemplo 2: Click com IP Brasileiro

**Request:**
```bash
curl -v "https://seu-dominio.com/click?ad_id=123&creative_id=456&redirect=https://example.com" \
  -H "X-Forwarded-For: 200.163.174.71"
```

**Response Headers:**
```
HTTP/2 302
location: https://example.com?ad_id=123&creative_id=456&ts=1701436800000&nonce=abc123&sig=def456&cid=...
set-cookie: __ad_click=1; SameSite=Lax; Secure
```

**Logs:**
```json
{
  "timestamp": "2024-12-01T12:00:00.000Z",
  "ad_id": "123",
  "creative_id": "456",
  "country_detected": "BR",
  "ip_hash": "...",
  "ua_hash": "...",
  "decision": "allow",
  "reasonCodes": []
}
```

