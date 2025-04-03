FROM node:18-alpine

WORKDIR /app

COPY . .

RUN apk add --no-cache openssl bash
RUN chmod +x /app/gen_cert.sh
RUN npm i

EXPOSE 8080 8080

CMD ["npm", "run", "start"]
