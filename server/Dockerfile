FROM node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

ARG PORT=8080
ENV PORT=$PORT
EXPOSE $PORT

CMD ["npm", "start"]
