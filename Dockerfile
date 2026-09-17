FROM node:20-alpine AS build
RUN apk add --no-cache openssl && corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

FROM node:20-alpine AS runtime
RUN apk add --no-cache openssl && corepack enable

WORKDIR /app

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --prod --frozen-lockfile

COPY --from=build /app/build ./build
COPY --from=build /app/prisma ./prisma

EXPOSE 3000

CMD ["pnpm", "run", "docker-start"]
