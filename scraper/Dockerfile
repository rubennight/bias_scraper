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

# Servicio persistente y liviano en reposo — server.py expone /run,
# que dispara pipeline.py como subproceso bajo demanda (no lo importa
# ni carga sus modelos al arrancar). 1 worker con hilos alcanza: no es
# tráfico alto y solo hay un pipeline corriendo a la vez. --timeout 0
# evita que gunicorn mate al worker mientras el stream SSE sigue vivo.
EXPOSE 8000
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "1", "--worker-class", "gthread", "--threads", "4", "--timeout", "0", "server:app"]
