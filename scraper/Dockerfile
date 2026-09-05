FROM python:3.11-slim

WORKDIR /app

# Dependencias del sistema necesarias para playwright, lxml, torch, etc.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libxml2-dev \
    libxslt1-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Instala los navegadores que playwright necesita
RUN playwright install --with-deps chromium

COPY . .

CMD ["python", "pipeline.py"]
