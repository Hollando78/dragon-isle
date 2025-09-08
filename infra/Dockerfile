FROM node:20-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm

COPY pnpm-lock.yaml* ./
COPY package.json ./
COPY pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps ./apps

RUN pnpm install

RUN pnpm --filter client build

FROM nginx:alpine

COPY --from=builder /app/apps/client/dist /usr/share/nginx/html
COPY infra/nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]