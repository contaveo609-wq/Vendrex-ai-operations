FROM node:24-bookworm-slim
WORKDIR /app/sales-gateway
COPY sales-gateway/package*.json ./
RUN npm ci --omit=dev --no-fund && npm cache clean --force
COPY sales-gateway/src ./src
COPY supabase/functions/sales/core.mjs /app/supabase/functions/sales/core.mjs
COPY supabase/functions/sales/behavior.mjs /app/supabase/functions/sales/behavior.mjs
USER node
EXPOSE 8787
CMD ["node","src/main.mjs"]
