FROM node:22-alpine

WORKDIR /app

# 1. Copiar archivos de dependencias y Prisma
COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# 2. Instalar dependencias (el postinstall de Prisma puede generar el cliente)
RUN npm install

# 3. Copiar el código y compilar TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# 4. Comando por defecto (sobreescrito a 'dev' en el docker-compose para local)
CMD ["npm", "start"]