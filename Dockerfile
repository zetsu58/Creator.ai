FROM node:22-alpine AS build
WORKDIR /app
COPY backend/package*.json ./
RUN npm install
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY backend/scripts ./scripts
COPY backend/db ./db
EXPOSE 8080
CMD ["sh", "-c", "node scripts/migrate.mjs && node dist/server.js"]
