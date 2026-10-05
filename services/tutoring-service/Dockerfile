FROM node:20-alpine AS base
WORKDIR /app
# El motor de Prisma necesita OpenSSL; Alpine no lo trae por defecto (a diferencia de las
# imágenes basadas en Debian) y sin esto falla en runtime con un error de parseo opaco.
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
# node_modules sale de "build", no de "deps": ahí es donde "prisma generate" escribió el
# cliente real dentro de @prisma/client. Copiar desde "deps" deja el stub sin generar y
# el arranque falla con "Cannot read properties of undefined (reading 'ADMIN')" al importar
# un enum del cliente.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./
EXPOSE 4002
# tsconfig.json no fija "rootDir", así que Nest preserva la carpeta src/ dentro de dist/
# (dist/src/main.js, no dist/main.js).
CMD ["node", "dist/src/main"]
