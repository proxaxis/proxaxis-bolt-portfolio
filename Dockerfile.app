FROM node:26.13.1

WORKDIR /app

RUN mkdir -p /app/node_modules && chown -R node:node /app

USER node

COPY --chown=node:node ./app/package*.json ./

RUN npm install

COPY --chown=node:node ./app/ ./

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
