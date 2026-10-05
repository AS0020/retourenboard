FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY shared ./shared
COPY public ./public
RUN mkdir /data && chown node:node /data
USER node
ENV HOST=0.0.0.0 PORT=3000 DB_PATH=/data/retouren.sqlite
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "server/index.js"]
