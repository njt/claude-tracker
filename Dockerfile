FROM node:20-slim

RUN apt-get update && apt-get install -y \
    git \
    openssh-client \
    rsync \
    && rm -rf /var/lib/apt/lists/*

# Set npm global prefix BEFORE installing packages
ENV NPM_CONFIG_PREFIX=/home/node/.npm-global
ENV PATH="/home/node/.npm-global/bin:$PATH"

# Create npm directories with correct ownership
RUN mkdir -p /home/node/.npm-global /home/node/.npm && chown -R node:node /home/node/.npm-global /home/node/.npm

# Install prettier and claude-code as node user to avoid permission issues
USER node
RUN npm install -g prettier @anthropic-ai/claude-code
USER root

# Copy fingerprint system
COPY --chown=node:node package.json package-lock.json tsconfig.json /home/node/tracker/
COPY --chown=node:node src/ /home/node/tracker/src/

# Install and build fingerprint system
WORKDIR /home/node/tracker
RUN npm ci && npm run build

COPY update-supervisor.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/update-supervisor.sh

USER node
WORKDIR /home/node

ENTRYPOINT ["/usr/local/bin/update-supervisor.sh"]
