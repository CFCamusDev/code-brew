FROM postgres:17-alpine
RUN apk add --no-cache nodejs restic
COPY run.mjs /opt/backups/run.mjs
USER postgres
ENTRYPOINT ["node", "/opt/backups/run.mjs"]
