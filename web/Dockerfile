# Etapa 1: build de la app React con Vite
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# VITE_API_URL se inyecta en build time (Vite la incrusta en el bundle
# estático, no se puede cambiar después en runtime). Como .dockerignore
# excluye .env del contexto de build, no hay archivo del que Vite la
# lea solo — se pasa como build arg desde docker-compose.yml o
# `docker build --build-arg VITE_API_URL=...`.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# Etapa 2: servir el build estático con nginx
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
