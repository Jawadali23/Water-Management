# Water Management System Frontend

## Docker

Run frontend and backend together from the repository root:

```bash
cd ..
docker compose up --build
```

That starts:

- Frontend on `http://localhost:8080`
- Backend on `http://localhost:8000`

Build the production image:

```bash
docker build -t wms-frontend .
```

Run it locally:

```bash
docker run --rm -p 8081:80 wms-frontend
```

Open:

```text
http://localhost:8080
```

If your API is not running on `http://localhost:8000`, override it at build time:

```bash
docker build --build-arg API_BASE_URL=http://host.docker.internal:8000 -t wms-frontend .
```
