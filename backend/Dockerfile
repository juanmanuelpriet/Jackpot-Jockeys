FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install system dependencies for Postgres client
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Make scripts executable
RUN chmod +x scripts/*.sh

EXPOSE 8000

# Entry point will be wait_for_db.sh which then calls migrate.sh and uvicorn
CMD ["./scripts/wait_for_db.sh", "./scripts/migrate.sh"]
