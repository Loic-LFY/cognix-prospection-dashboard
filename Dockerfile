FROM node:20-alpine
RUN apk add --no-cache python3 make g++ sqlite-dev sqlite-libs
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
