# Use lightweight Node image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files first (for layer caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy rest of project files
COPY . .

# Expose app port
EXPOSE 3000

# Start app
CMD ["node", "app.js"]