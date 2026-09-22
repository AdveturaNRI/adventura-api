# LiveKit in Docker Swarm

The stack runs one LiveKit media server and Redis. HTTPS/WSS is routed by the
existing Traefik through `traefik-public`; audio/video traffic bypasses Traefik
over UDP/TCP directly to the node that runs LiveKit. The stack is named
`livekit`, therefore its Redis DNS name inside Swarm is `livekit_redis`.

## 1. DNS and node placement

Create an `A` record for `call.adventu.ru` pointing to the public IP of the
Swarm node that will run LiveKit. Label that exact node:

```bash
docker node update --label-add adventura.livekit=true <node-name>
```

The `traefik-public` overlay network must already exist. The existing Traefik
must own ports 80 and 443 and have the `letsencrypt` resolver configured.

## 2. LiveKit credentials

Generate an independent API key pair. Do not reuse the previous LiveKit Cloud
key pair.

```bash
docker run --rm livekit/livekit-server:v1.13.7 generate-keys
```

The command prints an `API Key` and an `API Secret`. Create one Swarm secret
whose contents are YAML in this exact form:

```yaml
API_KEY_FROM_COMMAND: API_SECRET_FROM_COMMAND
```

For example, create a temporary local file with that one YAML line, then run:

```bash
docker secret create adventura_livekit_keys ./livekit-keys.yaml
```

Delete the temporary file after Docker confirms the secret was created. The
stack mounts it with mode `0400`; LiveKit reads it through `key_file`.

## 3. Deploy

In Portainer, create the stack from the contents of `swarm/livekit-stack.yml`.
The file is self-contained and does not need to be uploaded alongside
`livekit.yaml`. From a Swarm manager, the equivalent deployment is:

```bash
docker stack config -c swarm/livekit-stack.yml
docker stack deploy -c swarm/livekit-stack.yml livekit
docker stack services livekit
docker service logs -f livekit_server
```

The LiveKit endpoint for browser and mobile clients is:

```text
wss://call.adventu.ru
```

## 4. Firewall

Open these inbound ports on the VPS and in any provider firewall, only on the
node labelled `adventura.livekit=true`:

| Port | Protocol | Purpose |
| --- | --- | --- |
| 80, 443 | TCP | Traefik and WSS |
| 7881 | TCP | ICE/TCP fallback |
| 7882 | UDP | WebRTC media via UDP mux |
| 3478 | UDP | Embedded STUN/TURN |

Do not publish port 7880: it is reachable only through Traefik.

## 5. Connect Adventura API

The API must issue participant tokens using the same generated key pair. Put
the values in separate Swarm secrets and mount them into the Adventura API:

```yaml
LIVEKIT_URL: wss://call.adventu.ru
LIVEKIT_API_KEY_FILE: /run/secrets/livekit_api_key
LIVEKIT_API_SECRET_FILE: /run/secrets/livekit_api_secret
```

The existing LiveKit Cloud URL and credentials must be replaced together; a
token signed with another key pair is rejected by this server.

## Verification

```bash
curl -fsS https://call.adventu.ru/ >/dev/null
docker service logs --tail 100 livekit_server
```

Then use the official [LiveKit connection test](https://livekit.io/connection-test)
with `wss://call.adventu.ru` and an application-issued participant token.
Test from a mobile network as well as the office/home network; that confirms
the UDP media path rather than only WSS signaling.
