FROM node:22-alpine AS build
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/patch-facilitator-timeout.mjs scripts/patch-facilitator-timeout.mjs
RUN npm ci
COPY tsconfig.json openapi.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY scripts/patch-facilitator-timeout.mjs scripts/patch-facilitator-timeout.mjs
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY openapi.json ./
COPY public ./public
EXPOSE 3402
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:${PORT:-3402}/health || exit 1
CMD ["node", "dist/index.js"]
