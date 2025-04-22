FROM node:18-slim

WORKDIR /app

COPY . .

RUN apt-get update && apt-get install -y openssl bash && rm -rf /var/lib/apt/lists/*
RUN chmod +x /app/gen_cert.sh
RUN npm i

EXPOSE 8080 8000

CMD ["npm", "run", "start"]