FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install

FROM base AS build
# Los rewrites (/tutorias/** → MFE, /api/** → gateway) se fijan en el manifiesto de rutas
# en tiempo de build — por eso viajan como build-args.
ARG TUTORIAS_MFE_URL
ARG API_GATEWAY_URL
ENV TUTORIAS_MFE_URL=$TUTORIAS_MFE_URL
ENV API_GATEWAY_URL=$API_GATEWAY_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
