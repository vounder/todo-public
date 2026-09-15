FROM node:24.21.0-alpine@sha256:be80f76cf40ec8e42b9bec49f60a55e0660f30af58d3e5a25530785b30ea67e2

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

ARG PORT=8080
ENV PORT=$PORT
EXPOSE $PORT

CMD ["npm", "start"]
