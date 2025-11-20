# Use the official Apify Node.js 20 runtime (stable, supported)
FROM apify/actor-node:20

# Copy all project files, including .actor/
COPY . ./

# Install ONLY production dependencies
RUN npm install --only=prod --no-optional

# Start the actor
CMD ["npm", "start"]
