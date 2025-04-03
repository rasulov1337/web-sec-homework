FROM node:18-alpine

WORKDIR /app

COPY . .

RUN npm i

EXPOSE 8080 8080

CMD ["npm", "run", "start"]
