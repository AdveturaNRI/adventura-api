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

Create the S3 secrets from the access credentials issued by your object
storage provider. These are not generated with `openssl`.

```bash
printf %s '<S3_ACCESS_KEY_ID>' | docker secret create adventura_s3_access_key_id -
printf %s '<S3_SECRET_ACCESS_KEY>' | docker secret create adventura_s3_secret_access_key -
printf %s '<SMTP_PASS>' | docker secret create adventura_smtp_pass -
printf %s '<YANDEX_CLIENT_ID>' | docker secret create adventura_yandex_client_id -
printf %s '<YANDEX_CLIENT_SECRET>' | docker secret create adventura_yandex_client_secret -
printf %s '<VK_APP_ID>' | docker secret create adventura_vk_app_id -
printf %s '<VK_SERVICE_TOKEN>' | docker secret create adventura_vk_service_token -
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

S3 endpoint, region, bucket name, and URL TTL are not secrets. Add them to
the API service environment in the stack (or in SwarmPit):

```yaml
S3_ENDPOINT: https://storage.yandexcloud.net
S3_REGION: ru-central1
S3_BUCKET: your-private-bucket
S3_SIGNED_URL_EXPIRES_SEC: "3600"
S3_ACCESS_KEY_ID_FILE: /run/secrets/s3_access_key_id
S3_SECRET_ACCESS_KEY_FILE: /run/secrets/s3_secret_access_key

# SMTP (password via Swarm secret)
SMTP_HOST: mail.adventu.ru
SMTP_PORT: "587"
SMTP_SECURE: "false"
SMTP_USER: notification@adventu.ru
SMTP_FROM: Adventura <notification@adventu.ru>
SMTP_PASS_FILE: /run/secrets/smtp_pass
WEB_PUBLIC_URL: https://adventu.ru

# Yandex ID (via Swarm secrets)
YANDEX_CLIENT_ID_FILE: /run/secrets/yandex_client_id
YANDEX_CLIENT_SECRET_FILE: /run/secrets/yandex_client_secret

# VK ID (via Swarm secrets)
VK_APP_ID_FILE: /run/secrets/vk_app_id
VK_SERVICE_TOKEN_FILE: /run/secrets/vk_service_token
VK_API_VERSION: "5.199"
```

Attach these secrets to the `api` service:

```yaml
secrets:
  - s3_access_key_id
  - s3_secret_access_key
  - smtp_pass
  - yandex_client_id
  - yandex_client_secret
  - vk_app_id
  - vk_service_token
```

Declare them at stack level:

```yaml
secrets:
  s3_access_key_id:
    external: true
    name: adventura_s3_access_key_id
  s3_secret_access_key:
    external: true
    name: adventura_s3_secret_access_key
  smtp_pass:
    external: true
    name: adventura_smtp_pass
  yandex_client_id:
    external: true
    name: adventura_yandex_client_id
  yandex_client_secret:
    external: true
    name: adventura_yandex_client_secret
  vk_app_id:
    external: true
    name: adventura_vk_app_id
  vk_service_token:
    external: true
    name: adventura_vk_service_token
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
