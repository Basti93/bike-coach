FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY index.ts db.ts ./
RUN mkdir /data && chown node:node /data
USER node
CMD ["npx", "tsx", "index.ts"]
