FROM node:20-alpine

WORKDIR /app

# 1. Instalar dependencias
COPY package*.json ./
RUN npm install

# 2. Copiar Prisma y su configuración nueva
COPY prisma ./prisma/
COPY prisma.config.ts ./
RUN npx prisma generate

# 3. Copiar el código y compilar TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# 4. Comando por defecto (sobreescrito a 'dev' en el docker-compose para local)
CMD ["npm", "start"]