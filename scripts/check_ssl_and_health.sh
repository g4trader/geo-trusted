#!/usr/bin/env bash
# ============================================================================
# Script de Validação SSL e Health Check - Geo Trusted API
# ============================================================================
# 
# Este script valida o status do certificado SSL gerenciado e testa o endpoint
# /health do domínio ativo (trk.iasouth.tech).
# 
# Gera logs estruturados em JSON e salva resultados no diretório /reports.
#
# Uso: 
#   bash ./scripts/check_ssl_and_health.sh
#   ou
#   npm run check:prod-health
#
# ============================================================================

set -euo pipefail

# Configurações
CERT_NAME="click-api-ssl-cert"
DOMAIN="https://trk.iasouth.tech"
HEALTH_ENDPOINT="${DOMAIN}/health"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPORTS_DIR="${PROJECT_ROOT}/reports"

# Cores para output (opcional, mas útil)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Função para log
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Garantir que a pasta reports/ existe
mkdir -p "${REPORTS_DIR}"

log_info "Iniciando validação SSL e Health Check"
log_info "Certificado: ${CERT_NAME}"
log_info "Domínio: ${DOMAIN}"
log_info "Diretório de relatórios: ${REPORTS_DIR}"
echo ""

# Verificar se gcloud está disponível e autenticado
if ! command -v gcloud &> /dev/null; then
    log_error "gcloud CLI não está instalado ou não está no PATH"
    exit 1
fi

if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    log_error "Nenhuma conta GCP autenticada. Execute: gcloud auth login"
    exit 1
fi

# Verificar se jq está disponível
if ! command -v jq &> /dev/null; then
    log_error "jq não está instalado. Instale com: brew install jq (macOS) ou apt-get install jq (Linux)"
    exit 1
fi

# Verificar se curl está disponível
if ! command -v curl &> /dev/null; then
    log_error "curl não está instalado"
    exit 1
fi

# 1. Obter status do certificado SSL e salvar em JSON
log_info "Obtendo status do certificado SSL..."
SSL_STATUS_JSON="${REPORTS_DIR}/ssl_status.json"
SSL_STATUS_TMP="${SSL_STATUS_JSON}.tmp"
SSL_STATUS_ERR="${REPORTS_DIR}/ssl_status.err"

if ! gcloud compute ssl-certificates describe "${CERT_NAME}" \
    --global \
    --format="json" > "${SSL_STATUS_TMP}" \
    2> "${SSL_STATUS_ERR}"; then
    log_error "Falha ao obter status do certificado SSL (veja ${SSL_STATUS_ERR})"
    # Limpar arquivo temporário se existir
    rm -f "${SSL_STATUS_TMP}"
    exit 1
fi

# Mover arquivo temporário para o final (atomicidade)
mv "${SSL_STATUS_TMP}" "${SSL_STATUS_JSON}"

# 2. Ler status e armazenar em variável
SSL_STATUS=$(jq -r '.managed.status // "UNKNOWN"' "${SSL_STATUS_JSON}")

if [ -z "${SSL_STATUS}" ] || [ "${SSL_STATUS}" = "null" ]; then
    log_error "Não foi possível extrair o status do certificado SSL"
    exit 1
fi

log_info "Status SSL: ${SSL_STATUS}"
echo ""

# 3. Verificar se SSL está ACTIVE - se não estiver, abortar com exit 1
if [ "${SSL_STATUS}" != "ACTIVE" ]; then
    log_warn "SSL não está ACTIVE (status atual: ${SSL_STATUS}). Abortando health check."
    log_warn "O script retornará exit code 1 para que CI/cron detecte o problema."
    exit 1
fi

# 4. Executar testes do health endpoint (SSL está ACTIVE)
log_info "SSL está ACTIVE. Testando endpoint /health..."
HEALTH_STATUS_CODE=""
HEALTH_TIME_TOTAL=""

HEALTH_RAW="${REPORTS_DIR}/health_response_raw.txt"
HEALTH_RAW_TMP="${HEALTH_RAW}.tmp"
HEALTH_ERR="${REPORTS_DIR}/health_response.err"
HEALTH_JSON="${REPORTS_DIR}/health_response.json"
HEALTH_JSON_TMP="${HEALTH_JSON}.tmp"

if curl -sS -I "${HEALTH_ENDPOINT}" \
    -o "${HEALTH_RAW_TMP}" \
    -w '%{http_code} %{time_total}\n' \
    --max-time 10 \
    --connect-timeout 5 \
    2> "${HEALTH_ERR}" | {
      read code time || { code="ERROR"; time="ERROR"; }
      jq -n --arg sc "$code" --arg tt "$time" '{status_code:$sc, time_total:$tt}'
    } > "${HEALTH_JSON_TMP}"; then
    
    # Mover arquivos temporários para finais (atomicidade)
    mv "${HEALTH_RAW_TMP}" "${HEALTH_RAW}"
    mv "${HEALTH_JSON_TMP}" "${HEALTH_JSON}"
    
    # Extrair status_code e time_total do JSON
    HEALTH_STATUS_CODE=$(jq -r '.status_code' "${HEALTH_JSON}")
    HEALTH_TIME_TOTAL=$(jq -r '.time_total' "${HEALTH_JSON}")
    
    if [ "${HEALTH_STATUS_CODE}" = "200" ]; then
        log_info "✅ Health check OK - Status: ${HEALTH_STATUS_CODE}, Tempo: ${HEALTH_TIME_TOTAL}s"
    else
        log_warn "⚠️  Health check retornou status: ${HEALTH_STATUS_CODE}"
    fi
else
    log_error "Health check falhou (detalhes em ${HEALTH_ERR})"
    # Limpar arquivos temporários
    rm -f "${HEALTH_RAW_TMP}" "${HEALTH_JSON_TMP}"
    # Garantir JSON válido mesmo em erro
    jq -n --arg sc "ERROR" --arg tt "ERROR" \
        '{status_code:$sc, time_total:$tt}' > "${HEALTH_JSON_TMP}"
    mv "${HEALTH_JSON_TMP}" "${HEALTH_JSON}"
    HEALTH_STATUS_CODE="ERROR"
    HEALTH_TIME_TOTAL="ERROR"
fi

echo ""

# 5. Gerar log consolidado em JSON
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

log_info "Gerando relatório consolidado..."

STATUS_JSON="${REPORTS_DIR}/status_report.json"
STATUS_TMP="${STATUS_JSON}.tmp"

# Criar JSON consolidado usando jq para garantir formato válido
jq -n \
    --arg timestamp "${TIMESTAMP}" \
    --arg ssl_status "${SSL_STATUS}" \
    --arg health_status_code "${HEALTH_STATUS_CODE:-N/A}" \
    --arg health_time_total "${HEALTH_TIME_TOTAL:-N/A}" \
    '{
        timestamp: $timestamp,
        ssl_status: $ssl_status,
        health_status_code: $health_status_code,
        health_time_total: $health_time_total
    }' > "${STATUS_TMP}"

# Mover arquivo temporário para o final (atomicidade)
mv "${STATUS_TMP}" "${STATUS_JSON}"

# 6. Exibir resultado final formatado
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "📊 Relatório Consolidado"
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
cat "${STATUS_JSON}" | jq .
echo ""

log_info "Relatórios salvos em: ${REPORTS_DIR}/"
log_info "  - ssl_status.json: Status completo do certificado SSL"
log_info "  - ssl_status.err: Erros do gcloud (se houver)"
log_info "  - health_response_raw.txt: Resposta bruta do curl"
log_info "  - health_response.json: Resumo do health check em JSON (sempre válido)"
log_info "  - health_response.err: Erros do curl (se houver)"
log_info "  - status_report.json: Relatório consolidado final"
echo ""

# 7. Exit code baseado no resultado
# Exit codes:
#   0 → Tudo OK: SSL ACTIVE + health check concluído com sucesso
#   1 → Problema: Falha no gcloud, SSL não ACTIVE, ou health check falhou

if [ "${HEALTH_STATUS_CODE}" = "200" ]; then
    log_info "✅ Validação concluída com sucesso"
    exit 0
else
    log_warn "⚠️  Health check falhou ou retornou status diferente de 200"
    exit 1
fi

