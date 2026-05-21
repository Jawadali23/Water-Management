FROM nginx:1.27-alpine

ARG API_BASE_URL=http://localhost:8000

WORKDIR /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY index.html styles.css script.js review_page.js manual_reading.js downloadpdf.js config.js images.png ./
COPY charts/ ./charts/
COPY components/ ./components/
COPY services/ ./services/
COPY state/ ./state/
COPY utils/ ./utils/

RUN sed -i "s|http://localhost:8000|${API_BASE_URL}|g" /usr/share/nginx/html/config.js \
    && nginx -t

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
