# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY client/package*.json ./client/

# Install dependencies
RUN npm ci
RUN cd client && npm ci

# Copy source code
COPY . .

# Build frontend
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN apk add --no-cache vips-dev && npm ci --omit=dev

# Copy built app from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server

# Create directories for persistent data
RUN mkdir -p /app/uploads

# Start server
CMD ["node", "server/index.js"]
