# Guia de Integração - Mídia (DV360/Xandr)

Este guia explica como configurar o clickTag no Google Display & Video 360 (DV360) e Xandr para usar o serviço Geo Trusted.

## Visão Geral

O Geo Trusted intercepta cliques de anúncios, valida geolocalização e fraude, e redireciona para a landing page do cliente com parâmetros assinados.

**URL Base:** `https://click.seudominio.com/click`

## Configuração do ClickTag

### URL Template

Use esta URL como template para o clickTag:

```
https://click.seudominio.com/click?ad_id={AD_ID}&creative_id={CREATIVE_ID}&redirect={REDIRECT_URL}&cid={CLIENT_ID}&dsp={DSP_NAME}
```

### Parâmetros

| Parâmetro | Obrigatório | Descrição | Exemplo |
|-----------|-------------|-----------|---------|
| `ad_id` | ✅ Sim | ID único do anúncio | `12345` |
| `creative_id` | ✅ Sim | ID único do creative | `67890` |
| `redirect` | ✅ Sim | URL de destino final (deve ser URL-encoded) | `https%3A%2F%2Fsitecliente.com%2Flanding` |
| `cid` | ⚪ Opcional | Google Analytics Client ID (para tracking) | `1234567890.1234567890` |
| `dsp` | ⚪ Opcional | Identificador da origem | `xandr`, `dv360` |

## Google Display & Video 360 (DV360)

### Configuração Básica

1. Acesse sua campanha no DV360
2. Vá em **Creative Settings** → **Click-through URL**
3. Configure o clickTag:

```
https://click.seudominio.com/click?ad_id=%%AD_ID%%&creative_id=%%CREATIVE_ID%%&redirect=%%CLICK_URL_ESC%%&cid=%%CLIENT_ID%%&dsp=dv360
```

### Macros Disponíveis no DV360

| Macro | Descrição | Exemplo |
|-------|-----------|---------|
| `%%AD_ID%%` | ID do anúncio | `12345` |
| `%%CREATIVE_ID%%` | ID do creative | `67890` |
| `%%CLICK_URL_ESC%%` | URL de destino (URL-encoded) | `https%3A%2F%2Fsitecliente.com%2Flanding` |
| `%%CLIENT_ID%%` | Google Analytics Client ID | `1234567890.1234567890` |
| `%%TIMESTAMP%%` | Timestamp Unix | `1701234567` |

### Exemplo Completo DV360

```
https://click.seudominio.com/click?ad_id=%%AD_ID%%&creative_id=%%CREATIVE_ID%%&redirect=%%CLICK_URL_ESC%%&cid=%%CLIENT_ID%%&dsp=dv360
```

**URL Final Gerada (exemplo):**
```
https://click.seudominio.com/click?ad_id=12345&creative_id=67890&redirect=https%3A%2F%2Fsitecliente.com%2Flanding&cid=1234567890.1234567890&dsp=dv360
```

## Xandr (AppNexus)

### Configuração Básica

1. Acesse sua campanha no Xandr
2. Vá em **Creative** → **Click-through URL**
3. Configure o clickTag:

```
https://click.seudominio.com/click?ad_id={ad_id}&creative_id={creative_id}&redirect={click_url}&cid={client_id}&dsp=xandr
```

### Macros Disponíveis no Xandr

| Macro | Descrição | Exemplo |
|-------|-----------|---------|
| `{ad_id}` | ID do anúncio | `12345` |
| `{creative_id}` | ID do creative | `67890` |
| `{click_url}` | URL de destino (deve ser URL-encoded manualmente) | `https%3A%2F%2Fsitecliente.com%2Flanding` |
| `{client_id}` | Google Analytics Client ID (se disponível) | `1234567890.1234567890` |

**Nota:** Xandr pode não ter macro nativa para URL-encoding. Se necessário, use uma URL de destino simples e o Geo Trusted fará o encoding automaticamente.

### Exemplo Completo Xandr

```
https://click.seudominio.com/click?ad_id={ad_id}&creative_id={creative_id}&redirect={click_url}&cid={client_id}&dsp=xandr
```

**URL Final Gerada (exemplo):**
```
https://click.seudominio.com/click?ad_id=12345&creative_id=67890&redirect=https%3A%2F%2Fsitecliente.com%2Flanding&cid=1234567890.1234567890&dsp=xandr
```

## Outras Plataformas DSP

### The Trade Desk (TTD)

```
https://click.seudominio.com/click?ad_id={AD_ID}&creative_id={CREATIVE_ID}&redirect={CLICK_URL}&dsp=ttd
```

### Amazon DSP

```
https://click.seudominio.com/click?ad_id={AD_ID}&creative_id={CREATIVE_ID}&redirect={CLICK_URL}&dsp=amazon
```

## Comportamento Esperado

### Clique de Usuário no Brasil

1. Usuário clica no anúncio
2. Geo Trusted valida geolocalização (país = BR)
3. Geo Trusted gera assinatura HMAC
4. Usuário é redirecionado (302) para:
   ```
   https://sitecliente.com/landing?ad_id=12345&creative_id=67890&ts=1701234567890&nonce=abc123&sig=xyz789&cid=1234567890.1234567890
   ```

### Clique de Usuário Fora do Brasil

1. Usuário clica no anúncio
2. Geo Trusted detecta país ≠ BR
3. Usuário vê página de aviso informativo (HTTP 200)
4. **IMPORTANTE:** Usuário NÃO será redirecionado para o site do anunciante
5. A página de proteção é apenas informativa, sem botão "Continuar" ou qualquer link que leve ao destino final
6. O clique é consumido pela tela de proteção antifraude

## Testes

### Testar com País Forçado (Desenvolvimento)

Adicione `&debug_country=BR` ou `&debug_country=US` para testar:

```
https://click.seudominio.com/click?ad_id=12345&creative_id=67890&redirect=https%3A%2F%2Fsitecliente.com%2Flanding&debug_country=BR
```

**⚠️ Atenção:** `debug_country` só funciona em ambientes de desenvolvimento/staging.

## Troubleshooting

### Erro 400: Missing required parameters

**Causa:** Faltam parâmetros obrigatórios (`ad_id`, `creative_id`, `redirect`)

**Solução:** Verifique se todas as macros estão sendo substituídas corretamente.

### Erro 500: SIG_SECRET not configured

**Causa:** Problema de configuração no servidor (não é problema do clickTag)

**Solução:** Contate o suporte técnico.

### Redirecionamento não funciona

**Causa:** URL de `redirect` não está URL-encoded

**Solução:** Use `%%CLICK_URL_ESC%%` no DV360 ou encode manualmente a URL.

## Checklist de Configuração

- [ ] URL base configurada: `https://click.seudominio.com/click`
- [ ] Macros `ad_id` e `creative_id` configuradas
- [ ] Macro `redirect` configurada (URL-encoded)
- [ ] Macro `cid` configurada (opcional, mas recomendado)
- [ ] Parâmetro `dsp` configurado com nome da plataforma
- [ ] Testado em ambiente de desenvolvimento
- [ ] URL final validada (sem caracteres especiais não encoded)

## Suporte

Para dúvidas ou problemas, entre em contato com o suporte técnico.

---

**Última atualização:** 2025-11-27


