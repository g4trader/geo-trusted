# Geo Trusted API

API backend para o projeto Geo Trusted.

📖 **Especificação Técnica:** Veja [SPEC_CLICK_V1.md](./SPEC_CLICK_V1.md) para documentação completa do endpoint `/click`.

📚 **Guias de Integração:**
- [Guia para Mídia (DV360/Xandr)](./docs/GUIA_MIDIA_DV360_XANDR.md) - Como configurar clickTag
- [Guia para Desenvolvimento (Landing/GA4)](./docs/GUIA_DEV_LANDING_GA4.md) - Como integrar na landing page e GA4

## Stack

- **Backend**: Node.js + Express
- **Deploy**: Cloud Run / similar (stateless HTTP)

## Estrutura do Projeto

```
/
├── src/
│   ├── routes/       # Rotas da API
│   ├── services/     # Lógica de negócio
│   ├── utils/        # Utilitários
│   └── index.js      # Arquivo principal
├── test/             # Testes
└── package.json
```

## Instalação

```bash
npm install
```

## Execução

### Desenvolvimento
```bash
npm run dev
```

### Produção
```bash
npm start
```

O servidor será iniciado na porta 3000 (ou na porta definida pela variável de ambiente `PORT`).

## Testes

### Executar todos os testes
```bash
npm test
```

### Executar testes em modo watch
```bash
npm run test:watch
```

### Executar testes com cobertura
```bash
npm run test:coverage
```

### Estrutura de Testes

- **Q1 - Testes Unitários**: `test/utils/`, `test/services/`
  - `getClientIp` - Extração de IP de headers
  - `geoService` - Serviço de geolocalização (stub)
  - `sign/verify` - Assinatura HMAC
  - `fraudEngine` - Decisões de fraude

- **Q2 - Testes de Segurança**: `test/security.test.js`
  - Verificação de que `SIG_SECRET` nunca é logado
  - Verificação de que exceções não vazam informações sensíveis

- **Q3 - Testes End-to-End**: `test/e2e/click.test.js`
  - Caso `country=BR`: retorna 302, adiciona sig válido
  - Caso `country!=BR`: retorna HTML com aviso, loga OUT_OF_GEO

## Endpoints

### GET /health
Retorna o status da aplicação.

**Resposta:**
```json
{
  "status": "ok"
}
```

### GET /geo/context
Retorna o contexto da requisição (IP, headers, etc).

### GET /geo/country
Retorna o código do país baseado no IP.
- Query param: `debug_country` - força um país específico para desenvolvimento

### GET /click
Endpoint principal de click tracking com geolocalização.

**Query params obrigatórios:**
- `ad_id`: ID do anúncio
- `creative_id`: ID do creative
- `redirect`: URL de redirecionamento

**Query params opcionais:**
- `cid`: Campaign ID
- `dsp`: DSP ID
- `debug_country`: Força país para desenvolvimento

**Comportamento:**
- Se país detectado = **BR**: Redireciona 302 com assinatura HMAC e cookie `__ad_click=1`
- Se país detectado ≠ **BR**: Exibe página HTML com aviso e botão "Continuar"

## Deploy

### Docker

A aplicação inclui um `Dockerfile` otimizado para produção:

```bash
# Build da imagem
docker build -t geo-trusted:latest .

# Executar container
docker run -p 3000:3000 \
  -e PORT=3000 \
  -e SIG_SECRET=your-secret \
  -e LOG_SALT=your-salt \
  -e ENVIRONMENT=production \
  geo-trusted:latest
```

### Deploy Targets

#### Google Cloud Run

```bash
# Build e push para GCR
gcloud builds submit --tag gcr.io/PROJECT_ID/geo-trusted

# Deploy
gcloud run deploy geo-trusted \
  --image gcr.io/PROJECT_ID/geo-trusted \
  --platform managed \
  --region us-central1 \
  --set-env-vars ENVIRONMENT=production,SIG_SECRET=xxx,LOG_SALT=xxx \
  --set-secrets MAXMIND_DB_PATH=/secrets/geolite2-country.mmdb
```

**Notas:**
- Cloud Run define `PORT` automaticamente
- Use Secrets Manager para `SIG_SECRET` e `LOG_SALT`
- Para MaxMind DB, use Cloud Storage ou Secrets Manager

#### AWS ECS / Fargate

```bash
# Build e push para ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin ACCOUNT.dkr.ecr.us-east-1.amazonaws.com
docker build -t geo-trusted .
docker tag geo-trusted:latest ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/geo-trusted:latest
docker push ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/geo-trusted:latest
```

**Configuração ECS:**
- Task Definition: definir variáveis de ambiente via Secrets Manager
- Container Port: 3000
- Health Check: `/health`

#### Outros Targets

A aplicação é stateless e pode ser deployada em qualquer plataforma que suporte containers Docker:
- Kubernetes
- Azure Container Instances
- DigitalOcean App Platform
- Heroku (com buildpack Node.js)

## Check de Saúde em Produção

O projeto inclui um script automatizado para validar o status do certificado SSL e testar o endpoint `/health` do domínio em produção.

### Executar Validação

```bash
npm run check:prod-health
```

Ou diretamente:

```bash
bash ./scripts/check_ssl_and_health.sh
```

### O que o script faz:

1. **Verifica o status do certificado SSL** (`click-api-ssl-cert`)
   - Obtém o status atual do certificado gerenciado via `gcloud`
   - Salva informações completas em `reports/ssl_status.json`
   - Salva erros do `gcloud` em `reports/ssl_status.err` (se houver)

2. **Valida se SSL está ACTIVE**
   - Se SSL **não estiver ACTIVE**, o script **aborta com exit code 1**
   - Isso permite que CI/cron detectem automaticamente problemas de provisionamento
   - Mensagem de log informa o status atual (PROVISIONING, FAILED, etc.)

3. **Testa o endpoint `/health`** (apenas se SSL estiver `ACTIVE`)
   - Executa `curl` no domínio `https://trk.iasouth.tech/health`
   - Mede código HTTP e tempo total da requisição
   - Salva resposta bruta em `reports/health_response_raw.txt`
   - Salva resumo em JSON em `reports/health_response.json` (**sempre JSON válido**)
   - Salva erros do `curl` em `reports/health_response.err` (se houver)

4. **Gera relatório consolidado**
   - Cria `reports/status_report.json` com:
     - `timestamp` (UTC, ISO 8601)
     - `ssl_status`
     - `health_status_code` (se testado)
     - `health_time_total` (se testado)
   - Todos os arquivos JSON são gerados de forma atômica (usando arquivos temporários)

### Arquivos gerados

Todos os relatórios são salvos no diretório `reports/`:

- `ssl_status.json` - Status completo do certificado SSL
- `ssl_status.err` - Erros do `gcloud` (se houver falha)
- `health_response_raw.txt` - Resposta bruta do curl
- `health_response.json` - Resumo do health check em JSON (**sempre válido**, mesmo em erro)
- `health_response.err` - Erros do `curl` (se houver falha)
- `status_report.json` - Relatório consolidado final

**Nota:** Todos os arquivos JSON são garantidos como válidos, mesmo em caso de erro. O script usa arquivos temporários (`.tmp`) para garantir atomicidade e evitar arquivos parcialmente escritos em execuções concorrentes.

### Exit Codes

O script retorna códigos de saída apropriados para automação:

- **`0`** → Tudo OK: SSL está ACTIVE e health check retornou HTTP 200
- **`1`** → Problema detectado:
  - Falha ao obter status do certificado SSL
  - SSL não está ACTIVE (PROVISIONING, FAILED, etc.)
  - Health check falhou ou retornou status diferente de 200

**Importante:** Se o SSL não estiver ACTIVE, o script retorna exit code 1 imediatamente, sem executar o health check. Isso permite que sistemas de CI/cron detectem automaticamente problemas de provisionamento.

### Configuração de Cron (Opcional)

Para executar automaticamente a cada 30 minutos no Cloud Shell:

```bash
# Adicionar ao crontab
crontab -e

# Adicionar linha:
*/30 * * * * bash /workspace/geo-trusted/scripts/check_ssl_and_health.sh >> /workspace/geo-trusted/reports/check_ssl.log 2>&1
```

### Pré-requisitos

- `gcloud` CLI instalado e autenticado
- `jq` instalado (para processamento JSON)
- `curl` instalado
- Permissões para ler certificados SSL no projeto GCP

## Variáveis de Ambiente

### Checklist Completo

Crie um arquivo `.env` na raiz do projeto ou configure via seu sistema de deploy:

#### Obrigatórias

- ✅ **`PORT`** (string, padrão: `3000`)
  - Porta em que o servidor irá rodar
  - Cloud Run define automaticamente

- ✅ **`SIG_SECRET`** (string, obrigatório)
  - Secret para assinatura HMAC
  - **Nunca commitar no código!**
  - Use Secrets Manager em produção

- ✅ **`LOG_SALT`** (string, obrigatório)
  - Salt para hash de IP/UA nos logs
  - **Nunca commitar no código!**
  - Use Secrets Manager em produção

#### Opcionais - GA4

- ⚪ **`GA4_MEASUREMENT_ID`** (string, opcional)
  - Measurement ID do GA4 (formato: `G-XXXXXXXXXX`)
  - Necessário apenas se usar tracking GA4

- ⚪ **`GA4_API_SECRET`** (string, opcional)
  - API Secret do GA4 Measurement Protocol
  - Necessário apenas se usar tracking GA4

#### Opcionais - GeoIP

- ⚪ **`GEOIP_PROVIDER`** (string, padrão: `maxmind`)
  - Tipo de provider: `maxmind` | `http` | `stub`
  - `maxmind`: Usa database local (recomendado)
  - `http`: Usa API externa
  - `stub`: Sem geolocalização real (apenas para dev)

- ⚪ **`MAXMIND_DB_PATH`** (string, padrão: `./src/data/GeoLite2-Country.mmdb`)
  - Caminho para o arquivo GeoLite2-Country.mmdb
  - Necessário apenas se `GEOIP_PROVIDER=maxmind`

- ⚪ **`GEOIP_CACHE_ENABLED`** (boolean, padrão: `true`)
  - Habilita cache em memória para GeoIP
  - Reduz chamadas repetidas

- ⚪ **`GEOIP_CACHE_TTL`** (number, padrão: `3600000`)
  - TTL do cache em milissegundos (1 hora padrão)

- ⚪ **`GEOIP_API_URL`** (string, opcional)
  - URL da API externa (ex: `https://ipapi.co`)
  - Necessário apenas se `GEOIP_PROVIDER=http`

- ⚪ **`GEOIP_API_KEY`** (string, opcional)
  - API Key para provider HTTP
  - Necessário apenas se API externa requer autenticação

- ⚪ **`GEOIP_API_TIMEOUT`** (number, padrão: `2000`)
  - Timeout em milissegundos para chamadas HTTP
  - Necessário apenas se `GEOIP_PROVIDER=http`

#### Controle de Ambiente

- ⚪ **`ENVIRONMENT`** (string, padrão: `development`)
  - Controla comportamento da aplicação: `development` | `staging` | `production`
  - **`development`**: `debug_country` habilitado, logs verbosos
  - **`staging`**: `debug_country` habilitado, logs normais
  - **`production`**: `debug_country` desabilitado, logs otimizados
  - Fallback para `NODE_ENV` se não definido

- ⚪ **`ENABLE_DEBUG_COUNTRY`** (boolean, opcional)
  - Força habilitação de `debug_country` mesmo em produção
  - **Não usar em produção!** Apenas para testes

- ⚪ **`NODE_ENV`** (string, padrão: `development`)
  - Ambiente Node.js padrão
  - Usado como fallback se `ENVIRONMENT` não definido

### Exemplo de `.env` para Desenvolvimento

```env
# Obrigatórias
PORT=3000
SIG_SECRET=dev-secret-key-change-in-production
LOG_SALT=dev-log-salt-change-in-production

# Ambiente
ENVIRONMENT=development
NODE_ENV=development

# GA4 (opcional)
GA4_MEASUREMENT_ID=G-TEST123
GA4_API_SECRET=test-api-secret

# GeoIP (opcional)
GEOIP_PROVIDER=maxmind
MAXMIND_DB_PATH=./src/data/GeoLite2-Country.mmdb
GEOIP_CACHE_ENABLED=true
GEOIP_CACHE_TTL=3600000
ENABLE_DEBUG_COUNTRY=true
```

### Exemplo de `.env` para Produção

```env
# Obrigatórias (via Secrets Manager)
PORT=3000
SIG_SECRET=<from-secrets-manager>
LOG_SALT=<from-secrets-manager>

# Ambiente
ENVIRONMENT=production
NODE_ENV=production

# GA4 (se usar)
GA4_MEASUREMENT_ID=G-PRODUCTION123
GA4_API_SECRET=<from-secrets-manager>

# GeoIP
GEOIP_PROVIDER=maxmind
MAXMIND_DB_PATH=/app/data/GeoLite2-Country.mmdb
GEOIP_CACHE_ENABLED=true
GEOIP_CACHE_TTL=3600000
# ENABLE_DEBUG_COUNTRY não definido (desabilitado)
```

## Observabilidade e Métricas

### Logging Estruturado

A aplicação gera logs estruturados em JSON por linha, ideal para log aggregation:

**Logs de Click:**
```json
{
  "timestamp": "2025-11-27T13:00:00.000Z",
  "ad_id": "123",
  "creative_id": "456",
  "country_detected": "BR",
  "ip_hash": "sha256_hash",
  "ua_hash": "sha256_hash",
  "decision": "allow",
  "reasonCodes": []
}
```

**Logs de Erro:**
```json
{
  "timestamp": "2025-11-27T13:00:00.000Z",
  "level": "error",
  "message": "Error message sanitized",
  "stack": "Sanitized stack trace",
  "endpoint": "/click",
  "ad_id": "123",
  "ip_hash": "sha256_hash"
}
```

### Métricas e KPIs

Os logs estruturados permitem extrair métricas importantes para análise de negócio e operação.

#### 1. Taxa de Decisão por País

**Objetivo:** Entender % de `decision = allow` vs `warn` por país detectado.

**BigQuery:**
```sql
SELECT
  country_detected,
  decision,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (PARTITION BY country_detected), 2) as percentage
FROM
  `project.dataset.logs`
WHERE
  timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
  AND country_detected IS NOT NULL
GROUP BY
  country_detected,
  decision
ORDER BY
  country_detected,
  decision;
```

**Cloud Logging (GCP):**
```
resource.type="cloud_run_revision"
jsonPayload.country_detected!=""
jsonPayload.decision!=""
| stats count() by jsonPayload.country_detected, jsonPayload.decision
```

**Elasticsearch/Kibana:**
```
GET /logs/_search
{
  "size": 0,
  "query": {
    "range": {
      "timestamp": {
        "gte": "now-24h"
      }
    }
  },
  "aggs": {
    "by_country": {
      "terms": {
        "field": "country_detected.keyword"
      },
      "aggs": {
        "by_decision": {
          "terms": {
            "field": "decision.keyword"
          }
        }
      }
    }
  }
}
```

#### 2. Volume de Cliques por País

**Objetivo:** Entender distribuição geográfica de cliques.

**BigQuery:**
```sql
SELECT
  country_detected,
  COUNT(*) as total_clicks,
  COUNT(DISTINCT ad_id) as unique_ads,
  COUNT(DISTINCT creative_id) as unique_creatives,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage_of_total
FROM
  `project.dataset.logs`
WHERE
  timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
  AND country_detected IS NOT NULL
GROUP BY
  country_detected
ORDER BY
  total_clicks DESC;
```

**Cloud Logging (GCP):**
```
resource.type="cloud_run_revision"
jsonPayload.country_detected!=""
| stats count() by jsonPayload.country_detected
| sort count desc
```

**Elasticsearch/Kibana:**
```
GET /logs/_search
{
  "size": 0,
  "query": {
    "range": {
      "timestamp": {
        "gte": "now-24h"
      }
    }
  },
  "aggs": {
    "clicks_by_country": {
      "terms": {
        "field": "country_detected.keyword",
        "size": 50,
        "order": { "_count": "desc" }
      },
      "aggs": {
        "unique_ads": {
          "cardinality": {
            "field": "ad_id.keyword"
          }
        }
      }
    }
  }
}
```

#### 3. Taxa de OUT_OF_GEO

**Objetivo:** Monitorar quantos cliques são bloqueados por geolocalização.

**BigQuery:**
```sql
SELECT
  COUNTIF(ARRAY_LENGTH(reasonCodes) > 0 AND 'OUT_OF_GEO' IN UNNEST(reasonCodes)) as out_of_geo_count,
  COUNT(*) as total_clicks,
  ROUND(COUNTIF(ARRAY_LENGTH(reasonCodes) > 0 AND 'OUT_OF_GEO' IN UNNEST(reasonCodes)) * 100.0 / COUNT(*), 2) as out_of_geo_percentage
FROM
  `project.dataset.logs`
WHERE
  timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR);
```

#### 4. Performance por Ad/Creative

**Objetivo:** Identificar ads/creatives com melhor performance.

**BigQuery:**
```sql
SELECT
  ad_id,
  creative_id,
  COUNT(*) as total_clicks,
  COUNTIF(decision = 'allow') as allowed_clicks,
  COUNTIF(decision = 'warn') as warned_clicks,
  ROUND(COUNTIF(decision = 'allow') * 100.0 / COUNT(*), 2) as allow_rate
FROM
  `project.dataset.logs`
WHERE
  timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
GROUP BY
  ad_id,
  creative_id
HAVING
  total_clicks >= 100  -- Filtrar apenas com volume significativo
ORDER BY
  allow_rate DESC,
  total_clicks DESC;
```

#### 5. Erros e Disponibilidade

**Objetivo:** Monitorar saúde da aplicação.

**BigQuery:**
```sql
SELECT
  DATE(timestamp) as date,
  COUNTIF(level = 'error') as error_count,
  COUNT(*) as total_logs,
  ROUND(COUNTIF(level = 'error') * 100.0 / COUNT(*), 2) as error_rate
FROM
  `project.dataset.logs`
WHERE
  timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
GROUP BY
  date
ORDER BY
  date DESC;
```

### Dashboards Recomendados

1. **Dashboard de Negócio:**
   - Volume de cliques por país (gráfico de barras)
   - Taxa de allow vs warn por país (gráfico de pizza)
   - Top 10 ads por volume de cliques
   - Taxa de OUT_OF_GEO ao longo do tempo

2. **Dashboard Operacional:**
   - Taxa de erros ao longo do tempo
   - Erros por endpoint
   - Latência p95/p99 do endpoint `/click`
   - Taxa de sucesso do GA4 (eventos enviados vs falhas)

### Exportação de Logs

**Google Cloud:**
- Logs são automaticamente coletados pelo Cloud Logging
- Pode exportar para BigQuery para análise avançada
- Configurar sink: `gcloud logging sinks create bigquery-sink bigquery.googleapis.com/projects/PROJECT/datasets/DATASET`

**AWS:**
- CloudWatch Logs → Exportar para S3 → Athena para queries
- Ou usar CloudWatch Insights para queries diretas

**Elasticsearch:**
- Filebeat/Logstash para ingestão
- Kibana para visualização e dashboards

### Configuração do MaxMind GeoLite2

Para usar o provider MaxMind (recomendado):

1. Baixe o database GeoLite2-Country:
   - Acesse: https://dev.maxmind.com/geoip/geoip2/geolite2/
   - Crie uma conta gratuita
   - Baixe `GeoLite2-Country.mmdb`

2. Coloque o arquivo em `src/data/GeoLite2-Country.mmdb`

3. Configure `GEOIP_PROVIDER=maxmind` no `.env`

### Configuração de Provider HTTP (Alternativa)

Para usar API externa (ipapi.co, ipinfo.io, etc.):

```env
GEOIP_PROVIDER=http
GEOIP_API_URL=https://ipapi.co
GEOIP_API_KEY=your-api-key-if-needed
GEOIP_API_TIMEOUT=2000
```

