# 🩺 Monitoramento e Alertas — GEO-TRUSTED

Este documento descreve o processo completo de monitoramento e alerta de saúde do sistema em produção, incluindo ferramentas locais e integração com Google Cloud Monitoring.

---

## 1. Visão Geral

### Objetivo da Monitoração

O monitoramento do GEO-TRUSTED tem como objetivos principais:

- ✅ **Garantir disponibilidade e integridade** do endpoint `/health`
- ✅ **Detectar automaticamente** falhas de SSL, DNS ou API
- ✅ **Integrar** o monitoramento do GCP com o script local de verificação
- ✅ **Alertar o time técnico** em caso de problemas críticos

### Estratégia de Monitoramento em Camadas

O projeto utiliza uma abordagem em múltiplas camadas para garantir cobertura completa:

```
┌─────────────────────────────────────────────────────────────┐
│              CAMADA 1: Monitoramento Local                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  scripts/check_ssl_and_health.sh                    │  │
│  │  • Diagnóstico manual/sob demanda                     │  │
│  │  • Validação SSL via gcloud                          │  │
│  │  • Teste do endpoint /health                        │  │
│  │  • Relatórios em reports/                            │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ Complementa
                          ▼
┌─────────────────────────────────────────────────────────────┐
│        CAMADA 2: Monitoramento Contínuo (GCP)              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Uptime Check (Google Cloud Monitoring)              │  │
│  │  • Requisições externas periódicas                    │  │
│  │  • Simula comportamento de usuário final             │  │
│  │  • Intervalo configurável (1-5 minutos)              │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ Dispara
                          ▼
┌─────────────────────────────────────────────────────────────┐
│        CAMADA 3: Alertas Automáticos (GCP)                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Alert Policy (Google Cloud Monitoring)              │  │
│  │  • Notificação via e-mail                            │  │
│  │  • Condições configuráveis                           │  │
│  │  • Integração com canais futuros (Slack, PagerDuty)  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Componentes Principais

| Componente | Função | Frequência | Uso |
|------------|--------|------------|-----|
| **`check_ssl_and_health.sh`** | Diagnóstico local/manual | Sob demanda ou cron | Troubleshooting, validação manual |
| **Uptime Check (GCP)** | Monitoramento contínuo externo | 1-5 minutos | Detecção proativa de problemas |
| **Alert Policy (GCP)** | Alerta automático via e-mail | Quando condições são atendidas | Notificação imediata do time |

---

## 2. Verificação Manual com Script Local

### Execução

O script de verificação local pode ser executado de duas formas:

```bash
# Via npm (recomendado)
npm run check:prod-health

# Ou diretamente
bash ./scripts/check_ssl_and_health.sh
```

### Saídas Esperadas

O script gera os seguintes arquivos no diretório `reports/`:

#### Arquivos JSON (Sempre Válidos)

- **`ssl_status.json`** - Status completo do certificado SSL
  ```json
  {
    "name": "click-api-ssl-cert",
    "managed": {
      "status": "ACTIVE",
      "domains": ["trk.iasouth.tech", "trk.southmedia.com.br"]
    }
  }
  ```

- **`health_response.json`** - Resumo do health check
  ```json
  {
    "status_code": "200",
    "time_total": "0.043"
  }
  ```

- **`status_report.json`** - Relatório consolidado final
  ```json
  {
    "timestamp": "2025-11-28T17:00:00Z",
    "ssl_status": "ACTIVE",
    "health_status_code": "200",
    "health_time_total": "0.043"
  }
  ```

#### Arquivos de Diagnóstico

- **`ssl_status.err`** - Erros do `gcloud` (se houver falha)
- **`health_response.err`** - Erros do `curl` (se houver falha)
- **`health_response_raw.txt`** - Resposta bruta do curl (headers HTTP)

### Exit Codes

O script retorna códigos de saída apropriados para automação:

| Exit Code | Significado | Quando Ocorre |
|-----------|-------------|---------------|
| **`0`** | ✅ Sucesso | SSL está ACTIVE e health check retornou HTTP 200 |
| **`1`** | ❌ Problema | Falha no gcloud, SSL não ACTIVE, ou health check falhou |

**Importante:** Se o SSL não estiver ACTIVE, o script retorna exit code 1 imediatamente, sem executar o health check. Isso permite que sistemas de CI/cron detectem automaticamente problemas de provisionamento.

### Interpretação Rápida de `status_report.json`

#### ✅ Cenário Ideal (Tudo OK)

```json
{
  "timestamp": "2025-11-28T17:00:00Z",
  "ssl_status": "ACTIVE",
  "health_status_code": "200",
  "health_time_total": "0.043"
}
```

**Interpretação:** Sistema funcionando normalmente. SSL ativo e endpoint respondendo corretamente.

#### ⚠️ SSL em Provisionamento

```json
{
  "timestamp": "2025-11-28T17:00:00Z",
  "ssl_status": "PROVISIONING",
  "health_status_code": "N/A",
  "health_time_total": "N/A"
}
```

**Interpretação:** Certificado SSL ainda está sendo provisionado. Aguardar 10-60 minutos e executar novamente.

#### ❌ SSL Falhou

```json
{
  "timestamp": "2025-11-28T17:00:00Z",
  "ssl_status": "FAILED",
  "health_status_code": "N/A",
  "health_time_total": "N/A"
}
```

**Interpretação:** Falha no provisionamento do SSL. Verificar:
- DNS está configurado corretamente?
- Registros A apontam para o IP do Load Balancer?
- Consultar `reports/ssl_status.err` para detalhes.

#### ⚠️ Health Check Falhou

```json
{
  "timestamp": "2025-11-28T17:00:00Z",
  "ssl_status": "ACTIVE",
  "health_status_code": "500",
  "health_time_total": "10.000"
}
```

**Interpretação:** SSL está OK, mas o endpoint retornou erro. Verificar:
- Logs do Cloud Run
- Status do serviço
- Consultar `reports/health_response.err` para detalhes.

### Localização de Logs e Relatórios

Todos os relatórios são salvos em:

```
/Users/lucianoterres/Documents/GitHub/geo-trusted/reports/
```

Ou, em ambiente de produção (Cloud Shell):

```
/workspace/geo-trusted/reports/
```

### Configuração de Cron (Opcional)

Para executar automaticamente a cada 30 minutos no Cloud Shell:

```bash
# Adicionar ao crontab
crontab -e

# Adicionar linha:
*/30 * * * * bash /workspace/geo-trusted/scripts/check_ssl_and_health.sh >> /workspace/geo-trusted/reports/check_ssl.log 2>&1
```

**Nota:** O script já retorna exit codes apropriados, então você pode usar ferramentas de monitoramento de cron para detectar falhas automaticamente.

---

## 3. Uptime Check no Google Cloud Monitoring

O Uptime Check é um serviço do Google Cloud que faz requisições HTTP/HTTPS periódicas para endpoints configurados, simulando o comportamento de um usuário final.

### Passo a Passo para Configuração

#### 1. Acessar o Console GCP

1. Acesse o [Google Cloud Console](https://console.cloud.google.com)
2. Selecione o projeto `geo-trusted` (ou seu projeto GCP)
3. Navegue até **Monitoring** → **Uptime checks**

#### 2. Criar Novo Uptime Check

1. Clique em **"Create Uptime Check"**
2. Preencha os campos:

   **Informações Básicas:**
   - **Title:** `geo-trusted-health`
   - **Resource Type:** `URL`
   - **Protocol:** `HTTPS`
   - **URL:** `https://trk.iasouth.tech/health`

   **Configurações Avançadas:**
   - **Check Interval:** `1 minute` (ou `5 minutes` para reduzir custos)
   - **Timeout:** `10 seconds`
   - **Content Match (opcional):** `"status":"ok"` (se quiser validar o conteúdo da resposta)

3. Clique em **"Test"** para validar a configuração
4. Clique em **"Create"** para salvar

#### 3. Verificar Status

Após criar, o Uptime Check começará a fazer requisições periódicas. Você pode visualizar:

- **Status atual** (UP/DOWN)
- **Histórico de disponibilidade**
- **Tempo de resposta**
- **Gráficos de latência**

### Por Que Usar Uptime Check?

- ✅ **Monitoramento externo:** Detecta problemas de rede/DNS que o monitoramento interno pode não capturar
- ✅ **Simula usuário real:** Requisições vêm de múltiplas localizações geográficas
- ✅ **Histórico:** Mantém registro de disponibilidade ao longo do tempo
- ✅ **Integração:** Pode ser usado como condição para Alert Policies

### Custos

Uptime Checks têm custo baseado no número de checks executados:
- **Primeiros 100 checks/mês:** Gratuitos
- **Acima de 100 checks/mês:** ~$0.08 por check

Com intervalo de 5 minutos: ~8.640 checks/mês = ~$691/mês (após os 100 gratuitos)
Com intervalo de 1 minuto: ~43.200 checks/mês = ~$3.456/mês (após os 100 gratuitos)

**Recomendação:** Use intervalo de 5 minutos para produção, ou 1 minuto apenas se necessário para SLA crítico.

---

## 4. Políticas de Alerta (Alert Policies)

Alert Policies permitem configurar notificações automáticas quando condições específicas são atendidas.

### Passo a Passo para Configuração

#### 1. Acessar Alerting

1. No Google Cloud Console, navegue até **Monitoring** → **Alerting**
2. Clique em **"Create Policy"**

#### 2. Configurar Condição

1. Clique em **"Select a metric"**
2. Selecione **"Uptime check"** → **"Uptime check failure ratio"**
3. Configure:
   - **Resource type:** `Uptime check`
   - **Uptime check:** `geo-trusted-health`
   - **Condition:** `Failure ratio > 0.4` (40% de falhas)
   - **Time window:** `5 minutes`

**Alternativa (mais simples):**
- Selecione **"Uptime check"** → **"Uptime check status"**
- Configure:
  - **Condition:** `Status = DOWN`
  - **Time window:** `5 minutes`

#### 3. Configurar Notificações

1. Clique em **"Add Notification Channel"**
2. Selecione **"Email"**
3. Adicione os e-mails do time técnico:
   - Exemplo: `fabiano@example.com`, `dev-team@example.com`
4. Clique em **"Add"**

#### 4. Configurar Opções Avançadas (Opcional)

- **Alert name:** `Geo Trusted - Health Check Failed`
- **Documentation:** Adicione link para este documento ou runbook
- **Auto-close:** `24 hours` (fecha alerta automaticamente após 24h se problema for resolvido)

#### 5. Salvar e Ativar

1. Clique em **"Create Policy"**
2. A política ficará ativa imediatamente

### Recomendações de Configuração

#### Repetir Alerta se Problema Persistir

Para evitar spam de e-mails, configure:

- **Notification rate limit:** `1 notification per 30 minutes`
- Isso garante que você receba no máximo 1 e-mail a cada 30 minutos, mesmo que o problema persista

#### Horário de Silenciamento

Para janelas de manutenção programada:

1. Acesse a Alert Policy criada
2. Clique em **"Edit"**
3. Em **"Notification channels"**, configure:
   - **Mute notifications:** `Enabled`
   - **Mute until:** Selecione data/hora de fim da manutenção

Ou use o comando `gcloud`:

```bash
gcloud alpha monitoring policies update <POLICY_ID> \
  --notification-channels=<CHANNEL_ID> \
  --mute-until="2025-11-29T10:00:00Z"
```

### Exemplo de E-mail de Alerta

Quando um alerta é disparado, você receberá um e-mail com:

```
Subject: [ALERT] Geo Trusted - Health Check Failed

Uptime check 'geo-trusted-health' is DOWN.

Resource: https://trk.iasouth.tech/health
Status: DOWN
Last successful check: 2025-11-28T17:00:00Z
Current time: 2025-11-28T17:05:00Z

View in Console: [Link]
```

---

## 5. Ações Recomendadas ao Receber um Alerta

Quando um alerta é recebido, siga este fluxo de resposta operacional:

### Tabela de Resposta Rápida

| Situação Detectada | Ação Imediata | Comando/Verificação |
|-------------------|---------------|---------------------|
| **SSL não ACTIVE** | Executar diagnóstico local | `npm run check:prod-health`<br>Verificar `reports/ssl_status.err` |
| **Health 5xx ou timeout** | Testar endpoint manualmente | `curl -I https://trk.iasouth.tech/health`<br>Verificar logs do Cloud Run |
| **DNS sem resposta** | Checar propagação DNS | `dig trk.iasouth.tech +short`<br>Verificar em https://dnschecker.org |
| **Falha geral** | Consultar logs do Cloud Run | `gcloud run services logs read click-api-geo-trusted --limit=50` |
| **Load Balancer down** | Verificar status do LB | GCP Console → Load Balancing → Verificar health do backend |

### Fluxo de Troubleshooting Detalhado

#### 1. Confirmar o Problema

```bash
# Executar script local
npm run check:prod-health

# Verificar exit code
echo $?

# Se exit code = 1, verificar relatórios
cat reports/status_report.json | jq .
```

#### 2. Verificar SSL

```bash
# Ver status do certificado
gcloud compute ssl-certificates describe click-api-ssl-cert --global --format="json" | jq '.managed.status'

# Se status != "ACTIVE", verificar erros
cat reports/ssl_status.err
```

#### 3. Verificar DNS

```bash
# Verificar propagação
dig trk.iasouth.tech +short

# Deve retornar: 34.49.32.246
```

#### 4. Verificar Cloud Run

```bash
# Ver logs recentes
gcloud run services logs read click-api-geo-trusted \
  --region=southamerica-east1 \
  --limit=50

# Ver status do serviço
gcloud run services describe click-api-geo-trusted \
  --region=southamerica-east1 \
  --format="value(status.conditions)"
```

#### 5. Verificar Load Balancer

```bash
# Ver health do backend
gcloud compute backend-services get-health click-api-backend \
  --global

# Ver logs do Load Balancer
gcloud logging read "resource.type=http_load_balancer" \
  --limit=50 \
  --format=json | jq '.[] | {timestamp, httpRequest}'
```

### Escalação

Se o problema não for resolvido após seguir os passos acima:

1. **Documentar:** Anotar todos os passos executados e resultados
2. **Escalar:** Contatar o time de infraestrutura ou DevOps
3. **Comunicar:** Informar stakeholders sobre o problema e tempo estimado de resolução

---

## 6. Referências e Recursos

### Scripts e Ferramentas Locais

- **`scripts/check_ssl_and_health.sh`** - Script de diagnóstico local
  - Localização: `./scripts/check_ssl_and_health.sh`
  - Execução: `npm run check:prod-health`
  - Documentação: Ver `README.md` (seção "Check de Saúde em Produção")

- **`reports/status_report.json`** - Relatório mais recente
  - Localização: `./reports/status_report.json`
  - Formato: JSON com timestamp, SSL status, health check

### Console Google Cloud

- **Monitoring Console:** https://console.cloud.google.com/monitoring
- **Uptime Checks:** https://console.cloud.google.com/monitoring/uptime
- **Alert Policies:** https://console.cloud.google.com/monitoring/alerting
- **Cloud Run Logs:** https://console.cloud.google.com/run/detail/southamerica-east1/click-api-geo-trusted/logs

### Documentação do Projeto

- **README.md** - Documentação principal do projeto
- **RESUMO_LB_TRACKING.md** - Resumo operacional do Load Balancer
- **docs/GUIA_DOMINIOS_TRACKING.md** - Guia de configuração de domínios

### Documentação Externa

- **Google Cloud Monitoring:** https://cloud.google.com/monitoring/docs
- **Uptime Checks:** https://cloud.google.com/monitoring/uptime-checks
- **Alert Policies:** https://cloud.google.com/monitoring/alerts
- **Cloud Run Logging:** https://cloud.google.com/run/docs/logging

### Comandos Úteis

```bash
# Verificar status SSL
gcloud compute ssl-certificates describe click-api-ssl-cert --global

# Ver logs do Cloud Run
gcloud run services logs read click-api-geo-trusted --region=southamerica-east1

# Testar endpoint manualmente
curl -I https://trk.iasouth.tech/health

# Verificar DNS
dig trk.iasouth.tech +short
```

---

## 7. Próximas Evoluções (Roadmap)

Esta seção lista melhorias futuras planejadas para o sistema de monitoramento.

### Monitoramento de Métricas GA4

**Objetivo:** Validar que eventos GA4 estão sendo enviados corretamente.

**Implementação:**
- Criar Uptime Check adicional que valida eventos GA4
- Integrar com Google Analytics Data API para verificar recebimento
- Alertar se taxa de eventos válidos cair abaixo de threshold

**Prioridade:** Média

### Integração com Pub/Sub para Alertas Técnicos

**Objetivo:** Permitir integração com sistemas externos (Slack, PagerDuty, etc.).

**Implementação:**
- Configurar Pub/Sub topic para alertas
- Criar Cloud Function que processa alertas e envia para canais configurados
- Permitir configuração de múltiplos canais (e-mail, Slack, SMS)

**Prioridade:** Alta

### Exportação Automática de Relatórios para BigQuery

**Objetivo:** Permitir análise histórica e criação de dashboards.

**Implementação:**
- Configurar Cloud Function que executa após cada `check_ssl_and_health.sh`
- Função lê `reports/status_report.json` e insere em tabela BigQuery
- Criar dashboard no Data Studio/Google Analytics com métricas de disponibilidade

**Prioridade:** Baixa

### Monitoramento de Performance (Latência)

**Objetivo:** Detectar degradação de performance antes que afete usuários.

**Implementação:**
- Adicionar métricas de latência p95/p99 no Uptime Check
- Configurar alerta se latência exceder threshold (ex: > 1 segundo)
- Integrar com APM (Application Performance Monitoring) se necessário

**Prioridade:** Média

### Dashboard Centralizado

**Objetivo:** Visualização unificada de todas as métricas de saúde do sistema.

**Implementação:**
- Criar dashboard no Google Cloud Monitoring
- Incluir:
  - Status do Uptime Check
  - Latência do endpoint /health
  - Status do SSL
  - Taxa de erros do Cloud Run
  - Volume de requisições

**Prioridade:** Média

---

## 📝 Notas Finais

Este documento deve ser atualizado sempre que:

- Novos componentes de monitoramento forem adicionados
- Processos de alerta forem modificados
- Novas ferramentas forem integradas
- Mudanças na arquitetura afetarem o monitoramento

**Última atualização:** 2025-11-28  
**Versão:** 1.0  
**Mantido por:** Squad GEO-TRUSTED

