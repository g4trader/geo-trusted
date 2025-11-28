# 📋 Resumo Operacional - Load Balancer de Tracking

## 🎯 O Que Foi Criado

Esta infraestrutura expõe o serviço Cloud Run `click-api-geo-trusted` através de um **Load Balancer HTTP(S) Global** com domínios customizados.

### Recursos Criados

1. **Serverless Network Endpoint Group (NEG)**
   - Nome: `click-api-neg`
   - Aponta para: `click-api-geo-trusted` (Cloud Run)
   - Região: `southamerica-east1`

2. **Backend Service**
   - Nome: `click-api-backend`
   - Protocolo: HTTP
   - Logging: Habilitado (100% sample rate)

3. **URL Map**
   - Nome: `click-api-url-map`
   - Roteia todos os paths (`/*`) para o backend
   - Host rules para: `trk.southmedia.com.br`, `trk.iasouth.tech`

4. **Managed SSL Certificate**
   - Nome: `click-api-ssl-cert`
   - Domínios: `trk.southmedia.com.br`, `trk.iasouth.tech`
   - Provisionamento automático pelo Google

5. **Target HTTPS Proxy**
   - Nome: `click-api-lb-https-proxy`
   - Porta: 443

6. **Target HTTP Proxy** (redirect)
   - Nome: `click-api-lb-http-proxy`
   - Porta: 80
   - Redireciona HTTP → HTTPS

7. **Global Forwarding Rules**
   - `click-api-lb-https-forwarding-rule` (porta 443)
   - `click-api-lb-http-forwarding-rule` (porta 80)

### Domínios Configurados

- ⏳ `trk.southmedia.com.br` (pendente - será configurado posteriormente)
- ✅ `trk.iasouth.tech` (DNS configurado)

---

## 📊 Status de Homologação

| Domínio | DNS | SSL | Health | Click BR | Click US | Observação |
|---------|-----|-----|--------|----------|----------|------------|
| `trk.iasouth.tech` | ✅ OK<br>(34.49.32.246) | ⏳ PROVISIONING<br>(✅ Corrigido) | ⏳ Aguardando SSL | ⏳ Aguardando SSL | ⏳ Aguardando SSL | DNS OK, SSL corrigido e em provisionamento |
| `trk.southmedia.com.br` | ⏳ Pendente | ⏳ Pendente | N/A | N/A | N/A | Será configurado posteriormente |

**Última atualização:** 2025-11-28  
**Status SSL:** PROVISIONING (✅ **Corrigido:** Status mudou de `FAILED_NOT_VISIBLE` para `PROVISIONING`)  
**Correção SSL:** ✅ Executada - Certificado recriado apenas para `trk.iasouth.tech`  
**Testes HTTPS:** Não executados (aguardando SSL ACTIVE)

---

## 🚀 Como Re-aplicar

### Opção 1: Terraform (Recomendado)

```bash
cd infra

# Inicializar (apenas na primeira vez)
terraform init

# Revisar mudanças
terraform plan

# Aplicar
terraform apply
```

### Opção 2: Scripts gcloud (Alternativa)

Se preferir não usar Terraform, veja `scripts/create-lb.sh` (se disponível).

---

## 🔄 Como Reverter

### Opção 1: Terraform Destroy

⚠️ **ATENÇÃO:** Isso removerá **TODOS** os recursos do Load Balancer.

```bash
cd infra
terraform destroy
```

Confirme digitando `yes`.

**O que será removido:**
- Load Balancer e todas as regras
- Certificados SSL
- NEG e Backend Service
- **NÃO remove o Cloud Run service** (permanece intacto)

### Opção 2: Remover Manualmente

```bash
# Remover forwarding rules
gcloud compute forwarding-rules delete click-api-lb-https-forwarding-rule --global
gcloud compute forwarding-rules delete click-api-lb-http-forwarding-rule --global

# Remover proxies
gcloud compute target-https-proxies delete click-api-lb-https-proxy
gcloud compute target-http-proxies delete click-api-lb-http-proxy

# Remover URL map
gcloud compute url-maps delete click-api-url-map

# Remover backend service
gcloud compute backend-services delete click-api-backend --global

# Remover NEG
gcloud compute network-endpoint-groups delete click-api-neg --region=southamerica-east1

# Remover certificado SSL
gcloud compute ssl-certificates delete click-api-ssl-cert --global
```

---

## ⚠️ Pontos de Atenção para Produção

### 1. DNS

- ✅ **Sempre use registro A** (não CNAME) para apontar para o IP do Load Balancer
- ✅ **Mesmo IP para ambos os domínios** (Load Balancer global tem um único IP)
- ⚠️ **Propagação DNS:** Pode levar 5-30 minutos (máximo 48h)

### 2. Certificado SSL

- ✅ **Provisionamento automático:** Google gerencia tudo
- ⚠️ **Tempo de provisionamento:** 10-60 minutos após DNS configurado
- ✅ **Renovação automática:** Não requer intervenção manual
- ⚠️ **Status:** Monitore até ficar `ACTIVE`

### 3. Cloud Run

- ✅ **Não alterar região:** Deve permanecer em `southamerica-east1`
- ✅ **Não alterar nome:** Deve permanecer `click-api-geo-trusted`
- ⚠️ **Se renomear/mover:** Atualizar o NEG manualmente

### 4. Custos

- 💰 **Load Balancer:** ~$18/mês (base) + tráfego
- 💰 **Certificados SSL:** Gratuitos (managed)
- 💰 **NEG/Backend:** Sem custo adicional
- 📊 **Monitorar:** Use Cloud Billing para acompanhar

### 5. Segurança

- ✅ **HTTPS obrigatório:** HTTP redireciona automaticamente
- ✅ **TLS 1.2+:** Suportado automaticamente
- ⚠️ **Secrets:** Não expor `SIG_SECRET`, `LOG_SALT` em logs
- ✅ **Antifraude:** Continua funcionando normalmente

### 6. Monitoramento

- 📊 **Cloud Logging:** Logs do Load Balancer habilitados
- 📊 **Métricas:** Disponíveis no Cloud Console
- 🔔 **Alertas:** Configure para taxa de erro > 1%

### 7. Manutenção

- 🔄 **Atualizações:** Use `terraform apply` para mudanças
- 📝 **Backup:** Terraform state está versionado (recomendado usar backend remoto)
- 🔍 **Troubleshooting:** Veja `docs/GUIA_DOMINIOS_TRACKING.md`

---

## 📍 Localização dos Arquivos

```
geo-trusted/
├── infra/                          # Infraestrutura Terraform
│   ├── main.tf                     # Recursos principais
│   ├── variables.tf                 # Variáveis
│   ├── outputs.tf                  # Outputs (IPs, URLs)
│   └── README.md                   # Guia do Terraform
│
├── docs/
│   └── GUIA_DOMINIOS_TRACKING.md   # Guia completo de configuração
│
└── RESUMO_LB_TRACKING.md           # Este arquivo
```

---

## 🔗 Links Úteis

- **Cloud Console:** https://console.cloud.google.com/net-services/loadbalancing
- **Terraform Docs:** https://registry.terraform.io/providers/hashicorp/google/latest/docs
- **GCP Load Balancing:** https://cloud.google.com/load-balancing/docs/https

---

## 📞 Comandos Rápidos

### Scripts Disponíveis

Todos os scripts estão em `scripts/`:

```bash
# Configurar DNS (mostra instruções)
./scripts/configure-dns.sh

# Verificar status SSL
./scripts/check-ssl-status.sh

# Validação SSL + Health Check automatizado (recomendado)
npm run check:prod-health
# ou
./scripts/check_ssl_and_health.sh

# Testar endpoints
./scripts/test-endpoints.sh
```

### Obter IP do Load Balancer

```bash
cd infra
terraform output -raw load_balancer_ip
```

**IP Atual:** `34.49.32.246`

### Verificar Status do SSL

```bash
gcloud compute ssl-certificates describe click-api-ssl-cert --global --format="value(managed.status)"
```

Ou use o script:
```bash
./scripts/check-ssl-status.sh
```

### Verificar Propagação DNS

```bash
dig trk.southmedia.com.br +short
dig trk.iasouth.tech +short
```

Ambos devem retornar: `34.49.32.246`

### Testar Endpoints

```bash
curl https://trk.southmedia.com.br/health
curl https://trk.iasouth.tech/health
```

Ou use o script completo:
```bash
./scripts/test-endpoints.sh
```

### Ver Logs do Load Balancer

```bash
gcloud logging read "resource.type=http_load_balancer" --limit=50
```

### Validação Automatizada SSL + Health Check

Para validar automaticamente o status do SSL e testar o endpoint `/health`:

```bash
npm run check:prod-health
```

Este script:
- Verifica o status do certificado `click-api-ssl-cert`
- Testa o endpoint `/health` em `https://trk.iasouth.tech` (quando SSL estiver ACTIVE)
- Gera relatórios estruturados em JSON no diretório `reports/`

**Relatórios gerados:**
- `reports/ssl_status.json` - Status completo do certificado
- `reports/health_response.json` - Resumo do health check
- `reports/status_report.json` - Relatório consolidado

Para mais detalhes, veja a seção "Check de Saúde em Produção" no `README.md`.

---

---

## 📍 Configuração de DNS

### IP do Load Balancer

**✅ IP PÚBLICO DO LOAD BALANCER:** `34.49.32.246`

Este IP foi obtido após a execução do Terraform e deve ser usado nos registros DNS.

### Instruções DNS

#### Para `trk.southmedia.com.br` (Hostinger)

1. Acesse o painel de DNS da Hostinger
2. Localize o domínio `southmedia.com.br`
3. Adicione/edite o registro:

   **Tipo:** `A`  
   **Host/Nome:** `trk`  
   **Valor:** `34.49.32.246`  
   **TTL:** `3600`

4. Salve as alterações

**Exemplo:**
```
Nome: trk
Tipo: A
Valor: 34.XXX.XXX.XXX
TTL: 3600
```

#### Para `trk.iasouth.tech`

1. Acesse o painel de DNS do provedor onde `iasouth.tech` está hospedado
2. Adicione/edite o registro:

   **Tipo:** `A`  
   **Host/Nome:** `trk`  
   **Valor:** `34.49.32.246` (mesmo IP usado acima)  
   **TTL:** `3600`

3. Salve as alterações

**Nota:** Ambos os domínios devem apontar para o **mesmo IP** do Load Balancer.

### Verificar Propagação DNS

Após configurar, aguarde alguns minutos e verifique:

```bash
# Verificar trk.southmedia.com.br
dig trk.southmedia.com.br +short

# Verificar trk.iasouth.tech
dig trk.iasouth.tech +short

# Ambos devem retornar o mesmo IP do Load Balancer
```

**Tempo de propagação:** 5-30 minutos (máximo 48 horas)

---

## ✅ Checklist Final

Após executar `terraform apply`:

- [x] ✅ Terraform aplicado com sucesso
- [x] ✅ IP do Load Balancer obtido: `34.49.32.246`
- [x] ✅ Pronto para configurar DNS:
  - `trk.southmedia.com.br` → A → `34.49.32.246`
  - `trk.iasouth.tech` → A → `34.49.32.246`
- [ ] 🔄 Aguardando:
  - Propagação DNS (5-30 minutos)
  - SSL gerenciado ficar ativo (10-60 minutos após DNS)
- [ ] 🧪 Testes sugeridos após DNS e SSL ativos:
  - `curl -I https://trk.southmedia.com.br/health`
  - `curl -I https://trk.iasouth.tech/health`
  - `curl "https://trk.southmedia.com.br/click?ad_id=TEST&creative_id=TEST&redirect=https%3A%2F%2Fexemplo.com&debug_country=BR"`

---

**Última atualização:** 28 de Novembro de 2025  
**Versão:** 1.1

