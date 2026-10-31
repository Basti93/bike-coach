FROM node:24-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY index.ts db.ts ./
USER node
CMD ["npx", "tsx", "index.ts"]
