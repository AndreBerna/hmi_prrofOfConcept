FROM node:20-alpine AS build
WORKDIR /app
COPY package.json tsconfig.json tsconfig.node.json vite.config.ts index.html ./
COPY src ./src
RUN npm install && npm run build

FROM node:20-alpine
WORKDIR /app
RUN npm install -g http-server@14.1.1
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["http-server", "dist", "-p", "8080", "-a", "0.0.0.0", "-c", "1"]
