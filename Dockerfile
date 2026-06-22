# --- Build stage: compile TypeScript ---
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Runtime stage: production deps only ---
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
# init.sql is read at runtime by the migrate script
COPY --from=build /app/src/db/init.sql ./dist/db/init.sql

EXPOSE 3000
CMD ["node", "dist/server.js"]
