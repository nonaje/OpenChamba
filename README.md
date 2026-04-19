<img width="300" height="550" alt="OpenChamba" src="https://github.com/user-attachments/assets/8adce41c-7fe6-4607-be0a-c4ef39281e8d" />

# OpenChamba

Stack Docker para levantar OpenCode y OpenChamber con workspace compartido, persistencia local y una configuracion simple via `.env`.

## Que levanta

- `opencode`: API de OpenCode publicada por defecto en `127.0.0.1:4096`.
- `openchamber`: UI web publicada por defecto en `127.0.0.1:3000`.
- `restart-bridge`: servicio interno para que OpenChamber pueda reiniciar `opencode` y recargar configuracion.
- `exec-bridge`: API interna separada para ejecutar comandos en contenedores de forma controlada (resolviendo por `container` o por `service`+`project`).

Ambos contenedores comparten:

- workspace del host en `/workspace`
- `./data/ssh`
- configuracion efectiva de OpenCode desde la UI de OpenChamber

## Requisitos

- Docker con `docker compose`
- Bash para ejecutar `./init-data-dirs.sh`
- Puertos `3000` y `4096` libres, o ajustar `.env`

## Inicio rapido

```bash
cp .env.example .env
./init-data-dirs.sh
docker compose up -d
docker compose ps
```

Accesos por defecto:

- OpenChamber: `http://127.0.0.1:3000`
- OpenCode: `http://127.0.0.1:4096`

## Configuracion

La configuracion vive en `.env`. Usa `.env.example` como referencia completa.

Si corres varios stacks por proyecto, puedes partir de `examples/runtime/.env.project.example` y levantar con `docker compose --env-file <archivo> up -d`.

Variables que normalmente vas a tocar:

- `HOST_PROJECTS_DIR`: carpeta del host que se monta en `/workspace`
- `COMPOSE_PROJECT_NAME`: usa un valor unico por stack si corres multiples instancias en el mismo Docker host
- `OPENCHAMBER_UI_PASSWORD`: password de la UI; vacia desactiva auth
- `OPENCHAMBER_PORT`: puerto de la UI
- `OPENCODE_SERVER_PORT`: puerto de OpenCode
- `OPENCODE_SERVER_PASSWORD`: password HTTP opcional de OpenCode; si se define, OpenChamber y restart-bridge la usan para autenticarse
- `RESTART_BRIDGE_PORT`: puerto interno del servicio `restart-bridge`
- `OPENCODE_HEALTH_PATH`: ruta HTTP que `restart-bridge` usa para validar que OpenCode volvió a estar sano
- `OPENCODE_RESTART_TIMEOUT_MS`: timeout total compartido entre OpenChamber y `restart-bridge` para reinicios de OpenCode
- `EXEC_BRIDGE_PORT`: puerto interno del servicio `exec-bridge`
- `EXEC_BRIDGE_DEFAULT_TIMEOUT_MS`, `EXEC_BRIDGE_MAX_TIMEOUT_MS`, `EXEC_BRIDGE_MAX_BODY_BYTES`, `EXEC_BRIDGE_MAX_OUTPUT_BYTES`: tuning avanzado del `exec-bridge`
- `OPENCHAMBER_EXTERNAL_RESTART_TOKEN`: token opcional para OpenChamber hacia el restart-bridge (si queda vacio, reutiliza `OPENCODE_CONTROL_TOKEN`)
- `OPENCHAMBER_EXTERNAL_RESTART_TIMEOUT_MS`: timeout del request de reinicio desde OpenChamber; por defecto hereda `OPENCODE_RESTART_TIMEOUT_MS`
- `OPENCHAMBER_DOMAIN`, `TRAEFIK_NETWORK`, `TRAEFIK_INSTANCE_NAME`: solo si usas `docker-compose.override.yml` con Traefik

Notas utiles:

- `OPENCODE_SKIP_START=true` hace que OpenChamber use el `opencode` del stack y no intente arrancar uno embebido.
- `OPENCODE_HOST` en `.env` corresponde al bind host de `opencode` (por ejemplo `0.0.0.0`), no a la URL de proxy de OpenChamber.
- `OPENCODE_CONTROL_TOKEN` es obligatorio y debe ser largo, aleatorio y distinto por stack.
- `OPENCHAMBER_EXTERNAL_RESTART_TOKEN` protege el restart-bridge y normalmente debe reutilizar `OPENCODE_CONTROL_TOKEN`.
- `OPENCHAMBER_EXTERNAL_RESTART_URL` apunta al bridge interno por defecto; solo cambialo si sabes que necesitas otro endpoint.
- `restart-bridge` espera que OpenCode vuelva a responder `GET /global/health` con `healthy=true` antes de dar por exitoso el reinicio.
- Si defines `OPENCODE_SERVER_PASSWORD`, OpenChamber y restart-bridge la usan para autenticar contra OpenCode.
- `TARGET_COMPOSE_PROJECT` es opcional; si lo dejas vacio, el restart bridge autodetecta su proyecto Compose.
- Si cambias puertos o passwords, recrea los contenedores.

Ejemplo sin password en la UI:

```dotenv
OPENCHAMBER_UI_PASSWORD=
```

## Estructura persistente

```text
.
|- data/
|  |- opencode/
|  |- openchamber/
|  `- ssh/
`- projects/
```

Montajes importantes:

- `./data/opencode/config` y `./data/opencode/share` se comparten con `openchamber`
- `./data/opencode/state` y `./data/opencode/cache` quedan aislados para evitar conflictos de runtime
- `./data/openchamber/config` se monta en `${OPENCHAMBER_DATA_DIR}`
- `${HOST_PROJECTS_DIR}` se monta en `/workspace` en ambos contenedores

## Operacion diaria

Levantar:

```bash
docker compose up -d
```

Ver estado:

```bash
docker compose ps
```

Ver logs:

```bash
docker compose logs -f
docker compose logs -f opencode
docker compose logs -f openchamber
```

Detener:

```bash
docker compose down
```

Reconstruir:

```bash
docker compose build
docker compose up -d
```

Entrar a un contenedor:

```bash
docker compose exec opencode bash
docker compose exec openchamber bash
```

## Usar OpenCode desde terminal

```bash
docker compose exec opencode bash
cd /workspace/mi-proyecto
opencode
```

El binario `opencode` ya viene instalado dentro del contenedor `opencode`.

## restart-bridge

OpenChamber no reinicia contenedores directamente: delega en el servicio interno `restart-bridge`, que expone un endpoint HTTP interno para reiniciar `opencode` de forma controlada.

Uso normal en este repo:

- El compose ya conecta `OPENCHAMBER_EXTERNAL_RESTART_URL` al bridge interno.
- Define un token largo en `OPENCODE_CONTROL_TOKEN`.
- Si quieres separar credenciales, define `OPENCHAMBER_EXTERNAL_RESTART_TOKEN`; si no, se reutiliza `OPENCODE_CONTROL_TOKEN`.
- Ajusta `RESTART_BRIDGE_PORT` y `OPENCHAMBER_EXTERNAL_RESTART_TIMEOUT_MS` solo si necesitas afinar red/latencia.
- Si necesitas cambiar el tiempo maximo de reinicio, ajusta `OPENCODE_RESTART_TIMEOUT_MS` para mantener alineados a OpenChamber y `restart-bridge`.

Limites del `restart-bridge` en este stack:

- Solo se usa para reiniciar `opencode`.
- Requiere bearer token.
- Opera dentro de la red de Docker Compose (no se publica por puerto host en esta configuracion).
- Espera readiness real via `GET /global/health`, no solo apertura del puerto TCP.
- Tiene timeouts para llamadas al Docker socket y para el request que dispara OpenChamber.

## exec-bridge API (asincrona)

El servicio `exec-bridge` es independiente de `restart-bridge` y expone ejecucion remota controlada via token bearer obligatorio (`EXEC_BRIDGE_TOKEN`, con fallback a `OPENCODE_CONTROL_TOKEN` en `docker-compose.yml`).

Endpoints principales:

- `POST /v1/exec`: crea un trabajo y responde inmediato `202` con `{ id }`.
- `GET /v1/exec/:id`: consulta estado y resultados (`stdout`, `stderr`, `exitCode`, `timeout`, `cancelled`).
- `POST /v1/exec/:id/cancel`: solicita cancelacion de un trabajo en curso.
- `POST /v1/resolve`: resuelve target por contenedor (`{container}`) o por compose service (`{service, project?}`).

## OpenSpec y plugins incluidos

El contenedor `opencode` incluye:

- `OpenSpec`
- `oh-my-opencode-slim`
- `opencode-plugin-openspec`

Para usar OpenSpec en un repo, primero inicializalo:

```bash
docker compose exec opencode sh -lc 'cd /workspace/mi-proyecto && openspec init'
```

Comandos utiles de OpenSpec:

- `openspec list`
- `openspec show`
- `openspec validate`
- `openspec status`

## Seguridad

- El stack publica servicios en `127.0.0.1` por defecto.
- OpenChamber puede protegerse con `OPENCHAMBER_UI_PASSWORD`.
- Los contenedores corren como usuarios no root.
- `exec-bridge` y `restart-bridge` requieren bearer token; ambos aplican timeouts en sus operaciones con Docker.
- Si corres varios stacks, usa un `COMPOSE_PROJECT_NAME` distinto y un `OPENCODE_CONTROL_TOKEN` distinto en cada uno.
- No hay TLS ni auth adicional para OpenCode en este repo.
- Si dejas `OPENCHAMBER_UI_PASSWORD=` vacia, usalo solo en local o entornos temporales.

## Troubleshooting

OpenChamber sigue pidiendo password:

```dotenv
OPENCHAMBER_UI_PASSWORD=tu-password
```

o para desactivarla:

```dotenv
OPENCHAMBER_UI_PASSWORD=
```

Problemas de permisos en `data/` o `projects/`:

```bash
sudo chown -R 1000:1000 ./data ./projects
```

Si usas otro `HOST_PROJECTS_DIR`, reemplaza `./projects` por esa ruta.

OpenChamber no conecta con OpenCode:

- revisa `docker compose ps`
- confirma que `opencode` este `healthy`
- confirma que `OPENCODE_SKIP_START=true`
- confirma que `OPENCODE_SERVER_PORT` coincida en todo el stack

Puerto ocupado:

```dotenv
OPENCHAMBER_PORT=3001
OPENCODE_SERVER_PORT=4097
```
