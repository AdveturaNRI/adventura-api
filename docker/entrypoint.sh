#!/bin/sh
set -eu

load_secret_file() {
  variable_name="$1"
  eval "secret_file=\${${variable_name}_FILE:-}"

  if [ -z "${secret_file}" ]; then
    return
  fi

  if [ ! -r "${secret_file}" ]; then
    echo "Secret file for ${variable_name} is not readable: ${secret_file}" >&2
    exit 1
  fi

  secret_value="$(cat "${secret_file}")"
  export "${variable_name}=${secret_value}"
}

load_secret_file DB_PASSWORD
load_secret_file JWT_SECRET
load_secret_file ADMIN_PASSWORD
load_secret_file ADMIN_COOKIE_SECRET
load_secret_file ADMIN_SESSION_SECRET

# Prisma 6 reads a connection URL from its schema. Deployment supplies the
# connection pieces separately; construct the URL only in this process.
if [ -n "${DB_HOST:-}" ]; then
  export DATABASE_URL="$(node -e '
const {
  DB_HOST,
  DB_PORT = "5432",
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
  DB_SCHEMA = "public",
} = process.env;

for (const [name, value] of Object.entries({ DB_HOST, DB_NAME, DB_USER, DB_PASSWORD })) {
  if (!value) {
    console.error(`${name} must be set when DB_HOST is set`);
    process.exit(1);
  }
}

const url = new URL("postgresql://localhost");
url.username = DB_USER;
url.password = DB_PASSWORD;
url.hostname = DB_HOST;
url.port = DB_PORT;
url.pathname = `/${DB_NAME}`;
url.searchParams.set("schema", DB_SCHEMA);
process.stdout.write(url.toString());
')"
fi

exec "$@"
