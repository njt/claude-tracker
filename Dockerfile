FROM node:20-slim

RUN apt-get update && apt-get install -y \
    git \
    openssh-client \
    rsync \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g prettier

ENV NPM_CONFIG_PREFIX=/home/node/.npm-global
ENV PATH="/home/node/.npm-global/bin:$PATH"

RUN npm install -g @anthropic-ai/claude-code

COPY update-supervisor.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/update-supervisor.sh

USER node
WORKDIR /home/node

ENTRYPOINT ["/usr/local/bin/update-supervisor.sh"]
