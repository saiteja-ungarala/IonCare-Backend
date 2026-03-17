# ── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy manifests first so Docker caches the install layer
COPY package.json package-lock.json ./

# Install ALL deps (dev deps needed for tsc)
RUN npm ci

# Copy source and compile
COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy manifests and install PRODUCTION deps only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Create the uploads directory (needs to exist at runtime)
RUN mkdir -p uploads/agent-kyc uploads/dealer-kyc uploads/banners

# Copy the public admin panel if it exists
COPY public ./public 2>/dev/null || true

# Do NOT copy .env — secrets must be injected by the container platform at runtime.
# dotenv.config() will silently skip loading if .env is absent; process.env values
# set by the platform are already present before the app starts.

EXPOSE 5000

CMD ["node", "dist/server.js"]
