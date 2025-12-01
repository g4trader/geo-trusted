#!/bin/bash

# Script de Deploy para Google Cloud Run
# Geo Trusted API

set -e

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Variáveis
PROJECT_ID=geo-trusted
REGION=southamerica-east1
SERVICE_ACCOUNT_EMAIL=geo-trusted@geo-trusted.iam.gserviceaccount.com
SERVICE_NAME=click-api-geo-trusted
REPO_NAME=click-api
IMAGE_NAME=click-api
IMAGE_TAG=latest
PEM_FILE=./keys/service-account.json

echo -e "${GREEN}🚀 Iniciando deploy no Google Cloud Run${NC}"
echo "=========================================="
echo ""

# 1. Autenticação
echo -e "${YELLOW}1️⃣ Autenticando no GCP...${NC}"
gcloud auth activate-service-account $SERVICE_ACCOUNT_EMAIL \
  --key-file=$PEM_FILE \
  --project=$PROJECT_ID

gcloud config set project $PROJECT_ID
gcloud config set run/region $REGION

echo -e "${GREEN}✅ Autenticação concluída${NC}"
echo ""

# 2. Ativar serviços
echo -e "${YELLOW}2️⃣ Ativando serviços necessários...${NC}"
gcloud services enable run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  logging.googleapis.com \
  secretmanager.googleapis.com \
  2>&1 | grep -v "already enabled" || true

echo -e "${GREEN}✅ Serviços ativados${NC}"
echo ""

# 3. Criar repositório Docker
echo -e "${YELLOW}3️⃣ Verificando repositório Docker...${NC}"
gcloud artifacts repositories create $REPO_NAME \
  --repository-format=docker \
  --location=$REGION \
  --description="Repositório da Click API antifraude" \
  2>&1 | grep -v "already exists" || echo "ℹ️  Repositório já existe"

echo -e "${GREEN}✅ Repositório verificado${NC}"
echo ""

# 4. Build e push (requer Docker rodando ou permissões Cloud Build)
echo -e "${YELLOW}4️⃣ Build e push da imagem Docker...${NC}"
echo "⚠️  Nota: Requer Docker rodando OU permissões Cloud Build"

# Tentar Cloud Build primeiro
if gcloud builds submit \
  --tag $REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$IMAGE_NAME:$IMAGE_TAG \
  2>&1 | tee build.log; then
  echo -e "${GREEN}✅ Build via Cloud Build concluído${NC}"
else
  echo -e "${YELLOW}⚠️  Cloud Build falhou, tentando Docker local...${NC}"
  
  if docker ps > /dev/null 2>&1; then
    gcloud auth configure-docker $REGION-docker.pkg.dev --quiet
    docker build -t $REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$IMAGE_NAME:$IMAGE_TAG .
    docker push $REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$IMAGE_NAME:$IMAGE_TAG
    echo -e "${GREEN}✅ Build via Docker local concluído${NC}"
  else
    echo -e "${RED}❌ Docker não está rodando${NC}"
    echo "Por favor, inicie o Docker Desktop e execute novamente"
    exit 1
  fi
fi

echo ""

# 5. Deploy no Cloud Run
echo -e "${YELLOW}5️⃣ Fazendo deploy no Cloud Run...${NC}"

# Ler secrets do usuário (não hardcoded)
# Permite usar variáveis de ambiente ou input interativo
if [ -z "$SIG_SECRET" ]; then
  read -sp "Digite SIG_SECRET (não será exibido): " SIG_SECRET
  echo ""
fi

if [ -z "$LOG_SALT" ]; then
  read -sp "Digite LOG_SALT (não será exibido): " LOG_SALT
  echo ""
fi

if [ -z "$SIG_SECRET" ] || [ -z "$LOG_SALT" ]; then
  echo -e "${RED}❌ SIG_SECRET e LOG_SALT são obrigatórios${NC}"
  echo "Configure via variáveis de ambiente: export SIG_SECRET=... LOG_SALT=..."
  exit 1
fi

gcloud run deploy $SERVICE_NAME \
  --image=$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$IMAGE_NAME:$IMAGE_TAG \
  --platform=managed \
  --allow-unauthenticated \
  --port=3000 \
  --memory=512Mi \
  --max-instances=10 \
  --region=$REGION \
  --set-env-vars="ENVIRONMENT=production,GEOIP_PROVIDER=maxmind,MAXMIND_DB_PATH=/app/src/data/GeoLite2-Country.mmdb,SIG_SECRET=$SIG_SECRET,LOG_SALT=$LOG_SALT,GA4_MEASUREMENT_ID=G-TEST123,GA4_API_SECRET=TESTE-SECRET" \
  2>&1 | tee deploy.log

# Capturar URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format='value(status.url)')

echo ""
echo -e "${GREEN}✅ Deploy concluído!${NC}"
echo ""

# 6. Validar
echo -e "${YELLOW}6️⃣ Validando endpoints...${NC}"

echo "Testando /health..."
HEALTH_RESPONSE=$(curl -sS "$SERVICE_URL/health")
if echo "$HEALTH_RESPONSE" | grep -q '"status":"ok"'; then
  echo -e "${GREEN}✅ /health: OK${NC}"
else
  echo -e "${RED}❌ /health: FALHOU${NC}"
fi

echo "Testando /click?debug_country=BR..."
CLICK_BR_STATUS=$(curl -sS -o /dev/null -w "%{http_code}" "$SERVICE_URL/click?ad_id=123&creative_id=456&redirect=https%3A%2F%2Fexemplo.com&debug_country=BR")
if [ "$CLICK_BR_STATUS" = "302" ]; then
  echo -e "${GREEN}✅ /click BR: 302 OK${NC}"
else
  echo -e "${RED}❌ /click BR: Esperado 302, recebido $CLICK_BR_STATUS${NC}"
fi

echo "Testando /click?debug_country=US..."
CLICK_US_STATUS=$(curl -sS -o /dev/null -w "%{http_code}" "$SERVICE_URL/click?ad_id=123&creative_id=456&redirect=https%3A%2F%2Fexemplo.com&debug_country=US")
if [ "$CLICK_US_STATUS" = "200" ]; then
  echo -e "${GREEN}✅ /click US: 200 OK${NC}"
else
  echo -e "${RED}❌ /click US: Esperado 200, recebido $CLICK_US_STATUS${NC}"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}📋 RESUMO DO DEPLOY${NC}"
echo "=========================================="
echo "URL do Serviço: $SERVICE_URL"
echo "Projeto: $PROJECT_ID"
echo "Região: $REGION"
echo "Imagem: $REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/$IMAGE_NAME:$IMAGE_TAG"
echo ""
echo -e "${GREEN}✅ Deploy concluído com sucesso!${NC}"


