# Dockerfile para produção
FROM node:18-alpine

# Definir diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependências
COPY package.json package-lock.json* ./

# Instalar dependências de produção
# Usa npm install para maior compatibilidade (npm ci requer lockfile perfeito)
RUN npm install --only=production && npm cache clean --force

# Copiar código da aplicação
COPY src/ ./src/

# Criar diretório para dados do MaxMind
RUN mkdir -p src/data

# Copiar arquivo GeoLite2-Country.mmdb se existir (opcional, pode ser baixado em runtime)
# O arquivo deve estar em src/data/GeoLite2-Country.mmdb antes do build
# COPY src/data/GeoLite2-Country.mmdb* ./src/data/ || true

# Definir variáveis de ambiente
ENV NODE_ENV=production
ENV PORT=3000

# Expor porta
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Usuário não-root para segurança
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Mudar ownership dos arquivos
RUN chown -R nodejs:nodejs /app

# Mudar para usuário não-root
USER nodejs

# Comando de start
CMD ["npm", "start"]

