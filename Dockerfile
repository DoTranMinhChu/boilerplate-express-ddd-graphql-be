# ==================== stage 1: build ====================
FROM node:24-bullseye AS builder
WORKDIR /usr/src/app

# copy package files (including lock) first to leverage cache
COPY package*.json ./

# use npm ci when lock exists; fallback to npm install otherwise
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# copy source and build
COPY . .
RUN npm run build

# keep only production deps to reduce size
RUN npm prune --production

# ==================== stage 2: runner ====================
FROM node:24-bullseye-slim AS runner
WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV PORT=3000

# copy build output + production deps from builder
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package.json ./package.json

# copy font files — required by @napi-rs/canvas for Vietnamese text rendering
# fonts live in src/ which is not in dist/, so copy explicitly to a path the code checks
COPY --from=builder /usr/src/app/src/core/shared/utils/assets/fonts ./dist/core/shared/utils/assets/fonts

# create non-root user dir if needed (node user typically exists)
# ensure permissions if you create folders: RUN chown -R node:node /usr/src/app

# run as non-root
USER node

EXPOSE 3000

# start built server
CMD ["node", "dist/server.js"]