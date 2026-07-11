FROM nginx:1.27-alpine

RUN apk add --no-cache wget

COPY deploy/nginx/docker-gateway.conf /etc/nginx/conf.d/default.conf
