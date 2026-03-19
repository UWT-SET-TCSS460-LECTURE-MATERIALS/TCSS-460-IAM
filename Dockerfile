FROM node:22-alpine
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
COPY tsconfig.json ./

RUN npm ci --include=dev

COPY src ./src/
COPY public ./public/
COPY docs ./docs/

RUN npx prisma generate && npm run build

EXPOSE 8000
CMD ["npm", "start"]
