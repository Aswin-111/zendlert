# Use Node 20 Alpine
FROM node:20-alpine

# System deps required by Prisma engines on Alpine
RUN apk add --no-cache openssl libc6-compat

WORKDIR /usr/src/app

# Install deps first (better caching)
COPY package*.json ./
# Copy Prisma schema before install so postinstall (prisma generate) can run
COPY prisma ./prisma/
RUN npm install

# Copy the rest
COPY . .

# Expose app + gRPC ports
EXPOSE 7000
EXPOSE 5050
EXPOSE 5051

# Entrypoint to run migrations then start
COPY entrypoint.sh .
RUN chmod +x ./entrypoint.sh
ENTRYPOINT ["./entrypoint.sh"]

CMD ["npm", "start"]
