FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
COPY tsconfig.json ./
RUN npm ci --include=dev
COPY src ./src/
RUN npx prisma generate && npm run build

FROM node:22-alpine AS production
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
RUN npm ci --omit=dev && npx prisma generate
COPY --from=builder /app/dist ./dist/
COPY public ./public/
COPY docs ./docs/
EXPOSE 8000
CMD ["npm", "start"]
