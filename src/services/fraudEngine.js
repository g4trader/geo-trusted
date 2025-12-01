/**
 * Motor de avaliação de fraude
 * Versão 1 - Regras simples
 */
class FraudEngine {
  constructor() {
    // Estrutura para adicionar mais regras no futuro
    this.rules = [];
  }

  /**
   * Avalia contexto da requisição e retorna decisão
   * 
   * @param {Object} context - Contexto da requisição
   * @param {string} context.country - Código do país detectado
   * @param {string} context.acceptLanguage - Accept-Language header
   * @param {string} context.userAgent - User-Agent header
   * @param {string} context.ip - IP do cliente
   * @returns {Object} - {decision: 'allow'|'block'|'warn', reasonCodes: string[]}
   */
  evaluate(context) {
    const reasonCodes = [];
    let decision = 'allow';

    // Regra 1: OUT_OF_GEO
    // Se country !== 'BR' → decision = 'warn', reason OUT_OF_GEO
    if (context.country !== 'BR') {
      reasonCodes.push('OUT_OF_GEO');
      decision = 'warn';
    }

    // Futuras regras podem ser adicionadas aqui:
    // - acceptLanguage não contém pt
    // - assinaturas de UA suspeitos
    // - repetição de IP

    return {
      decision,
      reasonCodes,
    };
  }

  /**
   * Adiciona uma regra customizada
   * 
   * @param {Function} rule - Função que recebe context e retorna {decision, reasonCode} ou null
   */
  addRule(rule) {
    this.rules.push(rule);
  }
}

// Exporta instância singleton
const fraudEngine = new FraudEngine();

module.exports = fraudEngine;


