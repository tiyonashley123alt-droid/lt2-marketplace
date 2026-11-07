FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p /data

ENV NODE_ENV=production
ENV PORT=10000
ENV DB_PATH=/data/lt2.db

EXPOSE 10000

CMD ["node", "server.js"]
