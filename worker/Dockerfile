# Built with `npm run build` first (esbuild bundles src + /shared + /data into dist/index.js)
FROM node:20-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY dist ./dist
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
