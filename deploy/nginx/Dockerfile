FROM nginx:1.27-alpine

RUN apk add --no-cache wget

COPY deploy/nginx/docker-gateway.conf /etc/nginx/conf.d/default.conf

HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
    CMD wget -q -O - http://127.0.0.1/api/health/ || exit 1

EXPOSE 80
