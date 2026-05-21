# ==========================================================
# Stage 1: Build stage for installing dependencies
# ==========================================================
FROM python:3.12-slim AS builder

WORKDIR /build

# Install build dependencies for compiling Python packages (like pyodbc and numpy)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    unixodbc-dev \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy only requirements to leverage Docker caching
COPY requirements.txt .

# Install dependencies into a separate folder
RUN pip install --default-timeout=1000 --no-cache-dir --prefix=/install -r requirements.txt


# ==========================================================
# Stage 2: Runtime stage
# ==========================================================
FROM python:3.12-slim AS runner

WORKDIR /app

# Install system dependencies (unixODBC and Microsoft ODBC Driver 17 for SQL Server)
# We need gnupg2, curl, and apt-transport-https to fetch the MS packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gnupg2 \
    apt-transport-https \
    ca-certificates \
    && curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg \
    && echo "deb [arch=amd64,arm64 signed-by=/usr/share/keyrings/microsoft-prod.gpg] https://packages.microsoft.com/debian/12/prod bookworm main" > /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y --no-install-recommends \
        msodbcsql17 \
        unixodbc \
        libgssapi-krb5-2 \
    # Clean up curl and gnupg to keep runner slim, but keep dependencies
    && apt-get purge -y --auto-remove curl gnupg2 apt-transport-https \
    && rm -rf /var/lib/apt/lists/*

# Copy built packages from the builder stage
COPY --from=builder /install /usr/local

# Copy application source code
COPY . .

# Environment defaults inside the container
ENV HOST=0.0.0.0
ENV PORT=8000
ENV ENV=production

# Ensure manual_data folder exists and has correct permissions
RUN mkdir -p /app/manual_data && chmod 777 /app/manual_data

EXPOSE 8000

# Start FastAPI application
CMD ["python", "main.py"]
