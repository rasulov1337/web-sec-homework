# Запуск

## Init

Перед запуском не забудь добавить сертификаты:

```sh
sudo su
mkdir /usr/local/share/ca-certificates/web-sec
cp ca.crt /usr/local/share/ca-certificates/web-sec/
chmod 755 /usr/local/share/ca-certificates/web-sec/
chmod 644 /usr/local/share/ca-certificates/web-sec/ca.crt
update-ca-certificates
```

После этого перезапусти браузер

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

## 4 ДЗ

Так как параметров очень много, то я решил просто по умолчанию использовать только первые 7 из них. Если хочется протестировать все параметры, то надо закомментить предпоследнюю строку и раскомментить последнюю в `params.js`
