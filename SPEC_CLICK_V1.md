# Especificação Técnica v1 - Endpoint /click

## 1. Visão Geral

**Endpoint:** `GET /click`

**Objetivo:** Interceptar clique, avaliar geolocalização e fraude, redirecionar com assinatura ou exibir aviso.

---

## 2. Entrada

### 2.1 Query Parameters

#### Obrigatórios:
- `ad_id` (string): ID do anúncio
- `creative_id` (string): ID do creative
- `redirect` (URL): URL de destino final

#### Opcionais:
- `cid` (string): GA client_id (Google Analytics Client ID)
- `dsp` (string): Identificador da origem (ex: xandr, dv360)
- `debug_country` (string): Força país para desenvolvimento/testes

### 2.2 Headers Relevantes

O endpoint utiliza os seguintes headers para extração de contexto:

- `x-forwarded-for`: IP original do cliente (primeiro IP da lista)
- `cf-connecting-ip`: IP do cliente via Cloudflare
- `x-real-ip`: IP do cliente via proxy Nginx
- `user-agent`: User-Agent do navegador
- `accept-language`: Idioma preferido do cliente
- `referer` / `referrer`: URL de origem

---

## 3. Processamento

### 3.1 Fluxo Principal

1. **Extrair IP real**
   - Chama `getClientIp(req)` que considera ordem de prioridade:
     1. `x-forwarded-for` (primeiro IP)
     2. `cf-connecting-ip`
     3. `x-real-ip`
     4. `req.socket.remoteAddress`

2. **Obter país**
   - Chama `geoService.getCountryCode(ip, { debug_country })`
   - Retorna código ISO 3166-1 alpha-2 (ex: 'BR', 'US')
   - Retorna `null` para IPs privados ou indefinidos

3. **Montar contexto**
   ```javascript
   context = {
     ip,
     country,
     userAgent,
     acceptLanguage,
     referer,
     ad_id,
     creative_id
   }
   ```

4. **Avaliar fraude**
   - Chama `fraudEngine.evaluate(context)`
   - Retorna: `{ decision: 'allow'|'block'|'warn', reasonCodes: string[] }`

5. **Decisão de fluxo**

   **Caso A: `decision === 'allow'` E `country === 'BR'`**
   - Gerar `ts = Date.now()`
   - Gerar `nonce` aleatório
   - Gerar `sig` via HMAC SHA-256 base64url: `sign({ ad_id, creative_id, ts, nonce }, SIG_SECRET)`
   - Setar cookie: `__ad_click=1; SameSite=Lax; Secure` (Secure apenas em produção)
   - Chamar `sendGa4Event({ clientId, ad_id, creative_id, country_detected: 'BR' })` (assíncrono)
     - Se `cid` fornecido: usar como `clientId`
     - Caso contrário: gerar pseudo `client_id` (UUID v4) e adicionar como `cid` no redirect
   - Redirecionar (302) para: `redirect?ad_id=X&creative_id=Y&ts=Z&nonce=W&sig=S&cid=C&dsp=D`

   **Caso B: `decision !== 'allow'` OU `country !== 'BR'`**
   - Logar evento estruturado: `logger.logClick({ ad_id, creative_id, country_detected, ip, userAgent, decision, reasonCodes })`
   - Renderizar HTML com:
     - Aviso anti-fraud informativo
     - Mensagem explicando que o conteúdo está restrito (ex.: "Disponível apenas para acessos do Brasil")
     - **NÃO inclui qualquer botão ou link que utilize a URL de redirect**
     - **NÃO expõe a URL de redirect no HTML ou JavaScript**
     - Opcional: botão "Fechar" que chama `window.close()` ou `history.back()`, mas **NUNCA redireciona para o anunciante**

---

## 4. Resposta

### 4.1 Casos de Sucesso

**302 Found** (BR validado)
```
Location: {redirect}?ad_id={ad_id}&creative_id={creative_id}&ts={ts}&nonce={nonce}&sig={sig}&cid={cid}&dsp={dsp}
Set-Cookie: __ad_click=1; Path=/; SameSite=Lax; Secure
```

**200 OK** (Intersticial de proteção)
```
Content-Type: text/html
Body: HTML com aviso informativo, sem botões ou links que redirecionem para o anunciante
```

### 4.2 Casos de Erro

**400 Bad Request**
```json
{
  "error": "Missing required parameters: ad_id, creative_id, redirect"
}
```

**500 Internal Server Error**
```json
{
  "error": "SIG_SECRET not configured"
}
```

---

## 5. Assinatura HMAC

### 5.1 Geração

- **Algoritmo:** HMAC SHA-256
- **Encoding:** Base64URL (URL-safe)
- **Parâmetros assinados:** `ad_id`, `creative_id`, `ts`, `nonce`
- **Secret:** `SIG_SECRET` (variável de ambiente)
- **Ordenação:** Parâmetros ordenados alfabeticamente antes da assinatura

### 5.2 Verificação

```javascript
verifySignature({ ad_id, creative_id, ts, nonce }, sig, SIG_SECRET)
```

---

## 6. Integração GA4

### 6.1 Evento Enviado

**Nome:** `ad_click_valid`

**Parâmetros:**
- `ad_id`: ID do anúncio
- `creative_id`: ID do creative

**User Properties:**
- `country_detected`: Código do país (ex: 'BR')

**Client ID:**
- Se `cid` fornecido: usa `cid`
- Caso contrário: gera pseudo `client_id` (UUID v4) e adiciona como `cid` no redirect

**Configuração:**
- `GA4_MEASUREMENT_ID`: Measurement ID do GA4
- `GA4_API_SECRET`: API Secret do Measurement Protocol

**Comportamento:**
- Envio assíncrono (fire and forget)
- Não bloqueia o redirect
- Erros são logados mas não interrompem o fluxo

---

## 7. Logging Estruturado

### 7.1 Formato

JSON por linha (formato ideal para log aggregation):

```json
{
  "timestamp": "2025-11-27T13:00:00.000Z",
  "ad_id": "123",
  "creative_id": "456",
  "country_detected": "BR",
  "ip_hash": "sha256(ip + LOG_SALT)",
  "ua_hash": "sha256(userAgent + LOG_SALT)",
  "decision": "allow",
  "reasonCodes": []
}
```

### 7.2 Campos

- `timestamp`: ISO 8601
- `ad_id`: ID do anúncio
- `creative_id`: ID do creative
- `country_detected`: País detectado ou `null`
- `ip_hash`: Hash SHA-256 do IP com salt
- `ua_hash`: Hash SHA-256 do User-Agent com salt
- `decision`: `'allow'` | `'block'` | `'warn'`
- `reasonCodes`: Array de códigos de motivo (ex: `['OUT_OF_GEO']`)

---

## 8. Critérios de Aceite

### 8.1 Comportamento Funcional

✅ **Clique vindo de IP simulado BR → redireciona para o site com sig válido**
- Status 302
- URL de redirect contém `ad_id`, `creative_id`, `ts`, `nonce`, `sig`
- Assinatura é válida e pode ser verificada
- Cookie `__ad_click=1` é setado

✅ **Clique vindo de IP simulado fora do BR → exibe tela anti-fraud**
- Status 200
- HTML contém aviso sobre restrição geográfica
- **HTML NÃO contém botão "Continuar" ou qualquer link que redirecione para o anunciante**
- **HTML NÃO expõe a URL de redirect**
- Opcional: botão "Fechar" que apenas fecha a janela ou volta na história do navegador
- Log estruturado contém `OUT_OF_GEO` em `reasonCodes`

✅ **GA4 recebe evento `ad_click_valid` com `country_detected=BR` apenas em cliques BR**
- Evento enviado apenas quando `country === 'BR'` e `decision === 'allow'`
- `user_properties.country_detected = 'BR'`
- Evento contém `ad_id` e `creative_id`

### 8.2 Segurança

✅ **SIG_SECRET apenas em env, nunca em código**
- Secret nunca aparece em logs
- Secret nunca aparece em mensagens de erro
- Secret nunca aparece em respostas HTTP

✅ **IP e UA armazenados apenas em hash**
- Logs contêm apenas `ip_hash` e `ua_hash`
- Hash usa `LOG_SALT` de variável de ambiente
- Algoritmo: SHA-256

✅ **Assinaturas expiram após janela de tempo configurável (TTL)**
- `ts` (timestamp) é incluído na assinatura
- Cliente pode validar TTL verificando `Date.now() - ts < TTL`
- TTL configurável (sugestão: 5 minutos)

### 8.3 Observabilidade

✅ **Logs JSON estruturados disponíveis para análise**
- Formato JSON por linha
- Campos padronizados
- Timestamp ISO 8601

✅ **Possibilidade de filtrar por `country_detected`, `decision`, `reasonCodes`**
- Estrutura permite filtros eficientes
- Compatível com sistemas de log aggregation (ex: Cloud Logging, ELK)

### 8.4 Integração

✅ **Fácil configurar clickTag em Xandr/DV360 para apontar para /click**
- URL simples: `https://api.example.com/click?ad_id={ad_id}&creative_id={creative_id}&redirect={landing_page}`
- Parâmetros opcionais: `cid`, `dsp`

✅ **Cliente recebe documentação simples de como ler `ad_id`, `sig` e `country_detected` e como usar no GA4**
- Documentação de integração disponível
- Exemplos de código para verificação de assinatura
- Guia de uso do `cid` no GA4

---

## 9. Variáveis de Ambiente

```env
# Obrigatórias
SIG_SECRET=your-secret-key-here
LOG_SALT=your-log-salt-here

# Opcionais (para GA4)
GA4_MEASUREMENT_ID=G-XXXXXXXXXX
GA4_API_SECRET=your-ga4-api-secret

# Configuração
PORT=3000
NODE_ENV=production
```

---

## 10. Exemplos de Uso

### 10.1 ClickTag Xandr/DV360

```
https://api.example.com/click?ad_id=12345&creative_id=67890&redirect=https://advertiser.com/landing&dsp=xandr
```

### 10.2 Verificação de Assinatura (Cliente)

```javascript
const { verifySignature } = require('./hmac-utils');

const params = {
  ad_id: urlParams.get('ad_id'),
  creative_id: urlParams.get('creative_id'),
  ts: urlParams.get('ts'),
  nonce: urlParams.get('nonce')
};

const isValid = verifySignature(params, urlParams.get('sig'), CLIENT_SIG_SECRET);
const isExpired = Date.now() - parseInt(params.ts) > 5 * 60 * 1000; // 5 minutos

if (isValid && !isExpired) {
  // Processar click válido
}
```

### 10.3 Uso do cid no GA4 (Cliente)

```javascript
// Se cid foi fornecido ou gerado, usar no GA4
const cid = urlParams.get('cid');
if (cid) {
  gtag('config', 'GA4_MEASUREMENT_ID', {
    client_id: cid
  });
}
```

---

## 11. Notas de Implementação

- **Stateless:** Endpoint é stateless, adequado para Cloud Run
- **Assíncrono:** GA4 e logging são assíncronos, não bloqueiam resposta
- **Idempotente:** Múltiplas chamadas com mesmos parâmetros geram mesma assinatura
- **Extensível:** FraudEngine permite adicionar novas regras facilmente
- **Testável:** Cobertura de testes unitários, segurança e E2E

---

## 12. Changelog

**v1.0** (2025-11-27)
- Implementação inicial
- Suporte a geolocalização BR
- Assinatura HMAC
- Integração GA4
- Logging estruturado
- Anti-fraud básico (OUT_OF_GEO)


