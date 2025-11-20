FROM apify/actor-node:3.5

# Copy package files and install production deps
COPY package*.json ./
RUN npm install --only=prod

# Copy the rest of the code
COPY . ./

# Start the actor
CMD ["npm", "start"]
