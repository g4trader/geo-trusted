# 🧪 Guia de Execução de Testes - Geo Trusted API

Este guia fornece instruções passo a passo para executar testes locais completos do projeto.

## 📋 Pré-requisitos

- Node.js 18+ instalado
- npm instalado
- Acesso à internet (para instalar dependências)

## 🔧 Passo 1: Preparar Ambiente

### 1.1 Verificar Node.js

```bash
node -v
# Deve retornar v18.x.x ou superior
```

### 1.2 Configurar .env

O arquivo `.env` já está configurado com:

```env
PORT=3000
ENVIRONMENT=development
NODE_ENV=development
SIG_SECRET=test-secret-key-123
LOG_SALT=test-log-salt-456
GA4_MEASUREMENT_ID=G-TEST123
GA4_API_SECRET=test-api-secret
ENABLE_DEBUG_COUNTRY=true
GEOIP_PROVIDER=stub
GEOIP_CACHE_ENABLED=true
GEOIP_CACHE_TTL=3600000
```

### 1.3 Instalar Dependências

**Se houver problema de permissão no npm cache:**

```bash
# Opção 1: Limpar cache do npm
npm cache clean --force

# Opção 2: Usar --force
npm install --force

# Opção 3: Instalar dependências específicas
npm install jest@^29.7.0 supertest@^6.3.3 --save-dev
```

**Instalação normal:**

```bash
npm install
```

## 🚀 Passo 2: Iniciar Servidor

### 2.1 Iniciar em Modo Desenvolvimento

```bash
npm run dev
```

**Verificar se está rodando:**

```bash
curl http://localhost:3000/health
# Deve retornar: {"status":"ok"}
```

### 2.2 Iniciar em Modo Produção (alternativa)

```bash
npm start
```

## 🧪 Passo 3: Executar Testes

### 3.1 Testes Automatizados (Jest)

```bash
# Executar todos os testes
npm test -- --runInBand

# Executar com cobertura
npm run test:coverage

# Executar em modo watch
npm test -- --watch
```

### 3.2 Testes Manuais (Script Customizado)

Com o servidor rodando em outro terminal:

```bash
node test-manual.js
```

Este script testa:
- ✅ GET /health → 200 com {status:"ok"}
- ✅ GET /click?debug_country=BR → 302 com assinatura válida
- ✅ GET /click?debug_country=US → 200 HTML com aviso

## 📊 Passo 4: Validações Manuais

### 4.1 Testar /health

```bash
curl http://localhost:3000/health
```

**Esperado:**
```json
{"status":"ok"}
```

### 4.2 Testar /click com BR

```bash
curl -I "http://localhost:3000/click?ad_id=123&creative_id=456&redirect=https%3A%2F%2Fexemplo.com&debug_country=BR"
```

**Esperado:**
- Status: `302 Found`
- Header `Location`: URL com parâmetros assinados
- Cookie: `__ad_click=1`

**Exemplo de Location:**
```
https://exemplo.com/?ad_id=123&creative_id=456&ts=1701234567890&nonce=abc123&sig=xyz789
```

### 4.3 Testar /click com US (ou IP não-BR)

```bash
curl "http://localhost:3000/click?ad_id=123&creative_id=456&redirect=https%3A%2F%2Fexemplo.com&debug_country=US"
```

**Esperado:**
- Status: `200 OK`
- Content-Type: `text/html`
- Body: HTML com aviso sobre restrição geográfica
- Conteúdo: "Este conteúdo está disponível apenas para usuários no Brasil"
- **IMPORTANTE:** HTML NÃO deve conter:
  - Botão "Continuar" ou qualquer link que redirecione para o anunciante
  - URL de redirect (`https://exemplo.com` ou similar)
  - Parâmetros de query (`ad_id=123`, `creative_id=456`, etc.)
  - Qualquer JavaScript que redirecione (`window.location`, etc.)
- HTML deve conter:
  - Botão "Fechar" que chama `window.close()` (opcional)
  - Mensagem informativa sobre restrição geográfica

**Validação visual:**
- Modal/tela de proteção com mensagem de bloqueio
- Botão apenas de "Fechar/Voltar" (sem opção de continuar)
- Sem possibilidade de seguir para o site do anunciante

### 4.4 Verificar Logs Estruturados

Os logs aparecem no console em formato JSON por linha:

```json
{"timestamp":"2025-11-27T14:00:00.000Z","ad_id":"123","creative_id":"456","country_detected":"BR","ip_hash":"...","ua_hash":"...","decision":"allow","reasonCodes":[]}
```

**Validações:**
- ✅ Formato JSON válido
- ✅ Campos obrigatórios presentes
- ✅ IP e UA hasheados (não aparecem em texto)
- ✅ Nenhum secret (SIG_SECRET, LOG_SALT) aparece nos logs

## 🔍 Passo 5: Validações Específicas

### 5.1 Validar Assinatura HMAC

O script `test-manual.js` valida automaticamente. Para validar manualmente:

```javascript
const crypto = require('crypto');

function verifySignature(params, sig, secret) {
  const sortedKeys = Object.keys(params).sort();
  const message = sortedKeys
    .map(key => `${key}=${params[key]}`)
    .join('&');
  
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(message);
  const signature = hmac.digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  return signature === sig;
}
```

### 5.2 Validar GA4 Mock

O GA4Service tenta enviar evento quando `country=BR` e `decision=allow`. 

**Verificar logs:**
- Não deve aparecer erro de GA4 (se configurado corretamente)
- Evento `ad_click_valid` deve ser enviado (assíncrono)

### 5.3 Validar GeoIP

Com `GEOIP_PROVIDER=stub`:
- IPs privados retornam `null`
- `debug_country` funciona para forçar país

Com `GEOIP_PROVIDER=maxmind` (se database disponível):
- IPs públicos retornam código do país
- Cache funciona (TTL de 1 hora)

## 📝 Passo 6: Gerar Relatório

### 6.1 Salvar Logs

```bash
# Redirecionar output para arquivo
npm run dev > logs/server_$(date +%Y%m%d).log 2>&1

# Ou usar script de teste
./test-run.sh
```

### 6.2 Relatório de Cobertura

```bash
npm run test:coverage
```

O relatório será gerado em `coverage/`.

## ✅ Checklist de Validação

- [ ] Servidor inicia sem erros na porta 3000
- [ ] `/health` retorna 200 com `{"status":"ok"}`
- [ ] `/click?debug_country=BR` retorna 302 com assinatura válida
- [ ] `/click?debug_country=US` retorna 200 HTML com aviso
- [ ] **HTML de proteção (200) NÃO contém URL de redirect**
- [ ] **HTML de proteção (200) NÃO contém botão "Continuar"**
- [ ] **HTML de proteção (200) contém apenas botão "Fechar" (opcional)**
- [ ] Logs aparecem em formato JSON por linha
- [ ] Nenhum secret aparece nos logs
- [ ] IP e UA são hasheados nos logs
- [ ] Cookie `__ad_click=1` é setado para BR
- [ ] Assinatura HMAC é válida
- [ ] Todos os testes Jest passam (se disponível)

## 🐛 Troubleshooting

### Servidor não inicia

**Problema:** Erro ao iniciar servidor

**Solução:**
```bash
# Verificar se porta 3000 está livre
lsof -i :3000

# Matar processo se necessário
kill -9 <PID>

# Verificar .env
cat .env
```

### Testes não executam

**Problema:** Jest não encontrado

**Solução:**
```bash
# Instalar Jest globalmente (não recomendado)
npm install -g jest

# Ou usar npx
npx jest --runInBand
```

### Logs não aparecem

**Problema:** Logs não são gerados

**Solução:**
- Verificar se `ENVIRONMENT=development`
- Verificar se `ENABLE_DEBUG_COUNTRY=true`
- Verificar console do servidor

### Assinatura inválida

**Problema:** Assinatura sempre inválida

**Solução:**
- Verificar se `SIG_SECRET` no `.env` está correto
- Verificar se parâmetros estão sendo passados corretamente
- Verificar encoding da URL

## 📚 Arquivos de Referência

- `test-manual.js` - Script de testes manuais
- `test-run.sh` - Script de execução completa
- `TEST_RUN_REPORT.md` - Template de relatório
- `docs/` - Documentação de integração

## 🎯 Próximos Passos

1. Resolver problemas de permissão do npm (se houver)
2. Instalar todas as dependências
3. Executar suite completa de testes
4. Validar integração com GA4 real (opcional)
5. Validar integração com MaxMind real (opcional)

---

**Última atualização:** 2025-11-27


