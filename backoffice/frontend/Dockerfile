FROM node:20-alpine

WORKDIR /workspace/frontend

COPY shared /workspace/shared
COPY frontend/package*.json ./

RUN npm --prefix ../shared install
RUN npm --prefix ../shared run build
RUN npm install

COPY frontend .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
