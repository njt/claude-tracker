FROM node:20-slim

RUN apt-get update && apt-get install -y \
    git \
    openssh-client \
    rsync \
    && rm -rf /var/lib/apt/lists/*

# Set npm global prefix BEFORE installing packages
ENV NPM_CONFIG_PREFIX=/home/node/.npm-global
ENV PATH="/home/node/.npm-global/bin:$PATH"

# Create npm-global dir with correct ownership
RUN mkdir -p /home/node/.npm-global && chown -R node:node /home/node/.npm-global

# Install prettier and claude-code to the tracked location
RUN npm install -g prettier @anthropic-ai/claude-code

COPY update-supervisor.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/update-supervisor.sh

USER node
WORKDIR /home/node

ENTRYPOINT ["/usr/local/bin/update-supervisor.sh"]
