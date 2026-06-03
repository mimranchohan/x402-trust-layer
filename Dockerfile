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
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json scripts/patch-facilitator-timeout.mjs ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY openapi.json ./
COPY public ./public
USER app
EXPOSE 3402
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s \
  CMD node -e "const http=require('http');const p=process.env.PORT||3402;http.get('http://127.0.0.1:'+p+'/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"
CMD ["node", "dist/index.js"]
