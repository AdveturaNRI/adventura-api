# Adventura: Docker Swarm deployment

`docker-stack.yml` deploys Adventura's API, a one-off Prisma migration task,
PostgreSQL, and named volumes for PostgreSQL and uploads. It expects a
separately deployed Traefik connected to the external `traefik-public`
network, with the `letsencrypt` certificate resolver configured.

## 1. Prepare nodes

For a one-node installation, apply this label to the manager that will run
the data. This is intentional: Docker's default named volumes are local to a
node, so the API and PostgreSQL must stay on the node that owns their data.

```bash
docker node update --label-add adventura.data=true <data-node>
```

The `traefik-public` overlay network must already exist. DNS for `APP_DOMAIN`
must point to the Traefik entrypoint.

## 2. Create secrets

Use long, random values. The application receives the database host, port,
database name, user, and password separately. Its entrypoint constructs the
temporary Prisma connection URL only inside the container process.

```bash
openssl rand -hex 32 | docker secret create adventura_postgres_password -
openssl rand -hex 48 | docker secret create adventura_jwt_secret -
openssl rand -hex 32 | docker secret create adventura_admin_password -
openssl rand -hex 48 | docker secret create adventura_admin_cookie_secret -
openssl rand -hex 48 | docker secret create adventura_admin_session_secret -
```

## 3. Set non-secret deployment variables

Create a local `.env.swarm` file outside Git:

```dotenv
APP_DOMAIN=api.example.com
WEB_DOMAIN=app.example.com
ADMIN_EMAIL=admin@example.com
DADATA_API_KEY=
DADATA_SECRET_KEY=
```

## 4. Deploy and verify

```bash
set -a
. ./.env.swarm
set +a
docker stack deploy --with-registry-auth -c docker-stack.yml adventura
docker stack services adventura
docker service logs -f adventura_migrate
curl -f https://$APP_DOMAIN/api/health
```

The migration task is deliberately separate from the API. It may complete
after a deploy; inspect its logs before treating the release as successful.

## Storage and scaling

This stack runs one API replica because `uploads` is a local named volume.
Do not increase `api` replicas or remove its placement constraint until media
has moved to S3-compatible storage or a shared volume driver is configured.
PostgreSQL has no published port and is reachable only by the API over the
internal `backend` network.
