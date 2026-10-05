FROM node:20-alpine AS base
WORKDIR /app
# El motor de Prisma necesita OpenSSL; Alpine no lo trae por defecto.
RUN apk add --no-cache openssl

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./
EXPOSE 4003
# Aplica migraciones pendientes del schema "notifications" antes de arrancar.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]
