# Запуск

## Docker
```sh
docker build -t my-proxy .
docker run -p 8080:8080 -p 8000:8000 my-proxy
```

## curl
Команда для curl:
```sh
curl -x http://127.0.0.1:8080 -X GET -i http://mail.ru
```
