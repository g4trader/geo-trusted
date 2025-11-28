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
if ! gcloud compute ssl-certificates describe "${CERT_NAME}" \
    --global \
    --format="json" > "${REPORTS_DIR}/ssl_status.json" 2>/dev/null; then
    log_error "Falha ao obter status do certificado SSL"
    log_error "Verifique se o certificado existe e se você tem permissões"
    exit 1
fi

# 2. Ler status e armazenar em variável
SSL_STATUS=$(jq -r '.managed.status // "UNKNOWN"' "${REPORTS_DIR}/ssl_status.json")

if [ -z "${SSL_STATUS}" ] || [ "${SSL_STATUS}" = "null" ]; then
    log_error "Não foi possível extrair o status do certificado SSL"
    exit 1
fi

log_info "Status SSL: ${SSL_STATUS}"
echo ""

# 3. Se status == "ACTIVE", executar testes do health endpoint
HEALTH_STATUS_CODE=""
HEALTH_TIME_TOTAL=""

if [ "${SSL_STATUS}" = "ACTIVE" ]; then
    log_info "SSL está ACTIVE. Testando endpoint /health..."
    
    # Executar curl e salvar saída bruta
    if curl -I "${HEALTH_ENDPOINT}" \
        -o "${REPORTS_DIR}/health_response_raw.txt" \
        -s \
        -w '{"status_code":"%{http_code}","time_total":"%{time_total}"}\n' \
        --max-time 10 \
        --connect-timeout 5 > "${REPORTS_DIR}/health_response.json" 2>&1; then
        
        # Extrair status_code e time_total do JSON gerado pelo curl
        HEALTH_STATUS_CODE=$(jq -r '.status_code // "UNKNOWN"' "${REPORTS_DIR}/health_response.json")
        HEALTH_TIME_TOTAL=$(jq -r '.time_total // "UNKNOWN"' "${REPORTS_DIR}/health_response.json")
        
        if [ "${HEALTH_STATUS_CODE}" = "200" ]; then
            log_info "✅ Health check OK - Status: ${HEALTH_STATUS_CODE}, Tempo: ${HEALTH_TIME_TOTAL}s"
        else
            log_warn "⚠️  Health check retornou status: ${HEALTH_STATUS_CODE}"
        fi
    else
        log_error "Falha ao executar health check"
        HEALTH_STATUS_CODE="ERROR"
        HEALTH_TIME_TOTAL="ERROR"
    fi
else
    log_warn "SSL não está ACTIVE (status: ${SSL_STATUS}). Pulando teste de health check."
    log_warn "O endpoint /health só será testado quando o SSL estiver ACTIVE."
fi

echo ""

# 4. Gerar log consolidado em JSON
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

log_info "Gerando relatório consolidado..."

# Criar JSON consolidado usando jq para garantir formato válido
jq -n \
    --arg timestamp "${TIMESTAMP}" \
    --arg ssl_status "${SSL_STATUS}" \
    --arg health_status_code "${HEALTH_STATUS_CODE:-"N/A"}" \
    --arg health_time_total "${HEALTH_TIME_TOTAL:-"N/A"}" \
    '{
        timestamp: $timestamp,
        ssl_status: $ssl_status,
        health_status_code: $health_status_code,
        health_time_total: $health_time_total
    }' > "${REPORTS_DIR}/status_report.json"

# 5. Exibir resultado final formatado
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "📊 Relatório Consolidado"
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
cat "${REPORTS_DIR}/status_report.json" | jq .
echo ""

log_info "Relatórios salvos em: ${REPORTS_DIR}/"
log_info "  - ssl_status.json: Status completo do certificado SSL"
log_info "  - health_response_raw.txt: Resposta bruta do curl (se executado)"
log_info "  - health_response.json: Resumo do health check em JSON (se executado)"
log_info "  - status_report.json: Relatório consolidado final"
echo ""

# Exit code baseado no resultado
if [ "${SSL_STATUS}" = "ACTIVE" ]; then
    if [ "${HEALTH_STATUS_CODE}" = "200" ]; then
        log_info "✅ Validação concluída com sucesso"
        exit 0
    else
        log_warn "⚠️  SSL está ACTIVE, mas health check falhou"
        exit 1
    fi
else
    log_warn "⚠️  SSL não está ACTIVE. Execute novamente quando o certificado estiver provisionado."
    exit 0
fi

