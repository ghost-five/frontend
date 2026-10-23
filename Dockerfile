# Клиент — статика, поэтому образ простой: nginx и файлы игры.
FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html app.js engine.js styles.css config.js /usr/share/nginx/html/
COPY vendor /usr/share/nginx/html/vendor
# Проверка здоровья: без неё compose считает контейнер живым, даже если nginx упал.
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ > /dev/null || exit 1
