FROM node:20-alpine

WORKDIR /workspace/backend

COPY shared /workspace/shared
COPY backend/package*.json ./

RUN npm --prefix ../shared install
RUN npm --prefix ../shared run build
RUN npm install

COPY backend .

EXPOSE 3001

CMD ["npm", "run", "dev"]
