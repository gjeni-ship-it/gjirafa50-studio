# Playwright base image ships Chromium + system deps (needed for the approval render).
# Align the tag with the Playwright version in creative-engine/package.json.
FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /app
# Install deps for both packages first (better layer caching)
COPY creative-engine/package*.json ./creative-engine/
RUN cd creative-engine && npm install --omit=dev
COPY platform/package*.json ./platform/
RUN cd platform && npm install --omit=dev

# App code
COPY creative-engine ./creative-engine
COPY platform ./platform

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
WORKDIR /app/platform
# data/ should be a mounted persistent volume in production (see DEPLOY.md)
CMD ["node", "server.js"]
