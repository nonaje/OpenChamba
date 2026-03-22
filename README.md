<img width="300" height="550" alt="OpenChamba" src="https://github.com/user-attachments/assets/8adce41c-7fe6-4607-be0a-c4ef39281e8d" />

# OpenChamba

Stack Docker para ejecutar OpenCode y OpenChamber con workspace compartido, datos persistentes y dos modos de despliegue:

- **Desarrollo local** en `localhost`.
- **Produccion** detras de Traefik con exposicion minima.

## Que es

Este repositorio levanta dos servicios coordinados:

- **OpenCode** como servicio backend dentro de la red interna de Compose.
- **OpenChamber** como UI web conectada al servicio `opencode`.

Ambos contenedores comparten:

- un workspace comun (`/workspace`)
- persistencia de configuracion, cache, estado y datos de aplicacion
- un directorio `~/.ssh` comun (`./data/ssh`)

## Modos de despliegue

| Modo | Archivos Compose | Exposicion | Uso recomendado |
| --- | --- | --- | --- |
| Dev | `docker-compose.yml` + `docker-compose.dev.yml` | Puertos en `127.0.0.1` | Desarrollo local |
| Prod | `docker-compose.yml` + `docker-compose.prod.yml` | Solo por Traefik (HTTPS) | VPS/produccion |

## Que incluye

| Componente | Version por defecto | Rol |
| --- | --- | --- |
| OpenCode | `1.2.27` | Servicio principal |
| OpenChamber Web | `1.9.1` | Interfaz web |
| OpenSpec | `1.2.0` | CLI `openspec` en imagen de OpenCode |
| oh-my-opencode-slim | `0.8.3` | Plugin para flujo multiagente |
| opencode-plugin-openspec | `0.1.2` | Integracion de OpenSpec en OpenCode |

## Archivos principales

- `docker-compose.yml`: base comun (servicios, volumenes, healthchecks, hardening, red interna).
- `docker-compose.dev.yml`: overrides de desarrollo (ports en localhost, `extra_hosts`, `NODE_ENV=development`).
- `docker-compose.prod.yml`: overrides de produccion (Traefik, auth obligatoria, `NODE_ENV=production`, sin `ports`).
- `.env.dev.example`: plantilla de variables para entorno local.
- `.env.prod.example`: plantilla de variables para entorno productivo.
- `.env.example`: referencia general heredada para variables del stack.

## Requisitos

Generales:

- Docker Engine con `docker compose`
- Docker Compose Plugin v2
- Bash para ejecutar `./init-data-dirs.sh`
- Permisos para crear y ajustar ownership de `./data` y `HOST_PROJECTS_DIR`

Produccion (extra):

- Traefik funcionando en el host (o en el mismo Docker host)
- Red Docker externa para Traefik (default: `traefik-public`)
- DNS del dominio apuntando al VPS (ej: `openchamba.online`)
- Certresolver configurado en Traefik (ej: `letsencrypt`)

## Inicio rapido (desarrollo local)

```bash
cp .env.dev.example .env.dev
./init-data-dirs.sh
docker compose --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml up -d --build
docker compose --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml ps
```

Despues del arranque:

- OpenChamber UI: `http://127.0.0.1:3000`
- OpenCode API: `http://127.0.0.1:4096`
- Puerto auxiliar OpenCode (si aplica): `127.0.0.1:${OPENCODE_AUX_SERVER_PORT}`

## Inicio rapido (produccion con Traefik)

1) Preparar variables de prod

```bash
cp .env.prod.example .env.prod
```

2) Generar hash para Basic Auth de Traefik

```bash
docker run --rm httpd:2.4-alpine htpasswd -nbB admin 'cambia-esta-password'
```

3) Editar `.env.prod` y definir al menos:

- `OPENCHAMBER_UI_PASSWORD` (obligatoria, auth de la app)
- `TRAEFIK_BASIC_AUTH_USERS` (obligatoria, auth en edge/proxy)
- `OPENCHAMBER_DOMAIN=openchamba.online`
- `TRAEFIK_CERTRESOLVER` segun tu Traefik

4) Crear red externa de Traefik (si no existe)

```bash
docker network create traefik-public || true
```

5) Inicializar directorios y levantar stack

```bash
./init-data-dirs.sh
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml ps
```

Acceso esperado:

- `https://openchamba.online` (via Traefik)
- `openchamber` no publica puertos al host en prod
- `opencode` queda solo en red interna (no expuesto a internet)

## Configuracion por entorno

### Variables comunes

| Variable | Default | Uso |
| --- | --- | --- |
| `HOST_PROJECTS_DIR` | `./projects` (dev) | Directorio del host montado como `/workspace` |
| `OPENCODE_SERVER_PORT` | `4096` | Puerto interno de OpenCode |
| `OPENCODE_HOST` | `0.0.0.0` | Host interno de escucha de OpenCode |
| `OPENCODE_DISABLE_AUTOUPDATE` | `true` | Desactiva auto update para reproducibilidad |
| `OPENCHAMBER_PORT` | `3000` | Puerto interno de OpenChamber |
| `OPENCHAMBER_HOST` | `0.0.0.0` | Host interno de escucha de OpenChamber |
| `OPENCHAMBER_DATA_DIR` | `/home/openchamber/.config/openchamber` | Directorio interno de datos de OpenChamber |
| `OPENCODE_SKIP_START` | `true` | OpenChamber usa el `opencode` del stack en vez de uno embebido |
| `OPENCHAMBER_UI_PASSWORD` | vacia en dev / requerida en prod | Password de la UI de OpenChamber |
| `NODE_ENV` | segun override (`development`/`production`) | Entorno de ejecucion |

### Variables solo dev

| Variable | Default | Uso |
| --- | --- | --- |
| `OPENCODE_BIND_ADDRESS` | `127.0.0.1` | Address host para publicar OpenCode |
| `OPENCODE_AUX_SERVER_PORT` | `1455` | Puerto host para servicio auxiliar de OpenCode (contenedor escucha en `1455`) |
| `OPENCHAMBER_BIND_ADDRESS` | `127.0.0.1` | Address host para publicar OpenChamber |

### Variables solo prod (Traefik)

| Variable | Default ejemplo | Uso |
| --- | --- | --- |
| `OPENCHAMBER_DOMAIN` | `openchamba.online` | Host rule de Traefik |
| `TRAEFIK_ENTRYPOINT` | `websecure` | Entrypoint HTTPS en Traefik |
| `TRAEFIK_CERTRESOLVER` | `letsencrypt` | Resolver ACME de Traefik |
| `TRAEFIK_DOCKER_NETWORK` | `traefik-public` | Red Docker que Traefik usa para reachability |
| `TRAEFIK_BASIC_AUTH_USERS` | `admin:$2y$...` | Credenciales Basic Auth en formato htpasswd |

Notas utiles:

- En prod, Compose falla si faltan `OPENCHAMBER_UI_PASSWORD` o `TRAEFIK_BASIC_AUTH_USERS`.
- `OPENCODE_AUX_SERVER_PORT` solo afecta el mapeo host->contenedor en dev; no cambia el puerto interno `1455`.
- `host.docker.internal` se agrega solo en dev para compatibilidad local.

## Arquitectura

### Desarrollo local

```text
Navegador
    |
    v
127.0.0.1:3000
    |
    v
+-------------------+        red interna de Compose        +-------------------+
|   openchamber     | ----------------------------------> |     opencode      |
|   UI / Web        |                                      |   servicio base   |
|   puerto 3000     | <---------------------------------- |   puerto 4096     |
+-------------------+                                      +-------------------+
        |
        +------------------- /workspace ------------------------------+
        +--------------------- ./data/ssh ----------------------------+
```

### Produccion con Traefik

```text
Internet
   |
   v
Traefik (:443, TLS)
   |
   v
+-------------------+        red interna de Compose        +-------------------+
|   openchamber     | ----------------------------------> |     opencode      |
|   UI / Web        |                                      |   servicio base   |
+-------------------+                                      +-------------------+

Exposicion publica directa:
- openchamber: NO (solo via Traefik)
- opencode: NO
```

## Persistencia y estructura

```text
.
|- data/
|  |- opencode/
|  |  |- config/
|  |  |- share/
|  |  |- state/
|  |  `- cache/
|  |- openchamber/
|  |  |- config/
|  |  |- share/
|  |  |- state/
|  |  `- cache/
|  `- ssh/
`- projects/
```

Mapeos persistentes:

- `./data/opencode/config` -> `/home/opencode/.config/opencode`
- `./data/opencode/share` -> `/home/opencode/.local/share/opencode`
- `./data/opencode/state` -> `/home/opencode/.local/state/opencode`
- `./data/opencode/cache` -> `/home/opencode/.cache/opencode`
- `./data/openchamber/config` -> `${OPENCHAMBER_DATA_DIR}`
- `./data/openchamber/share` -> `/home/openchamber/.local/share/openchamber`
- `./data/openchamber/state` -> `/home/openchamber/.local/state/openchamber`
- `./data/openchamber/cache` -> `/home/openchamber/.cache/openchamber`
- `./data/ssh` -> `~/.ssh` en ambos contenedores
- `${HOST_PROJECTS_DIR}` -> `/workspace` en ambos contenedores

`./init-data-dirs.sh` crea estos directorios e intenta ajustar ownership a `1000:1000`.

## Operacion diaria

Puedes definir helpers para no repetir `-f` y `--env-file`:

```bash
dcdev() {
  docker compose --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml "$@"
}

dcprod() {
  docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml "$@"
}
```

Comandos comunes:

```bash
# Estado
dcdev ps
dcprod ps

# Logs
dcdev logs -f
dcdev logs -f openchamber
dcprod logs -f openchamber

# Reinicio/stop
dcdev up -d
dcdev down
dcprod up -d
dcprod down

# Rebuild
dcdev up -d --build
dcprod up -d --build

# Shell
dcdev exec opencode bash
dcdev exec openchamber bash
dcprod exec opencode bash
```

## Plugins incluidos

### oh-my-opencode-slim

[`oh-my-opencode-slim`](https://github.com/alvinunreal/oh-my-opencode-slim) se instala por defecto en OpenCode y agrega flujo multiagente.

- Agente principal: `orchestrator`
- Especialistas incluidos: `explorer`, `librarian`, `oracle`, `designer`, `fixer`

### OpenSpec

[`OpenSpec`](https://openspec.dev/) habilita Spec-Driven Development (SDD). El CLI `openspec` queda disponible en el contenedor `opencode`.

### opencode-plugin-openspec

[`opencode-plugin-openspec`](https://github.com/Octane0411/opencode-plugin-openspec) integra OpenSpec en OpenCode.

## Uso de OpenSpec SDD

OpenSpec preinstalado no inicializa automaticamente cada proyecto. Debes ejecutar `openspec init` en la raiz del repo.

Ejemplo:

```bash
docker compose --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml exec opencode sh -lc 'cd /workspace/mi-proyecto && openspec init'
```

Comandos CLI utiles despues de init:

- `openspec list`
- `openspec show`
- `openspec validate`
- `openspec status`
- `openspec archive`
- `openspec update`

Comandos de chat del agente:

- `/opsx:propose`
- `/opsx:explore`
- `/opsx:apply`
- `/opsx:archive`

## Usar OpenCode desde terminal

Si prefieres trabajar con terminal dentro de OpenCode:

```bash
docker compose --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml exec opencode bash
cd /workspace/mi-proyecto
opencode
```

Notas:

- El binario `opencode` ya esta en el `PATH`.
- El servicio principal sigue corriendo como `opencode serve`.
- Los repos del host quedan disponibles en `/workspace`.

## Seguridad

Medidas aplicadas en el stack:

- Contenedores ejecutan con usuarios no root (`opencode` / `openchamber`).
- `security_opt: no-new-privileges:true`.
- `cap_drop: [ALL]`.
- `pids_limit: 512`.
- Rotacion de logs (`json-file`, `10m`, `3` archivos).
- Healthchecks activos para ambos servicios.
- En prod: sin `ports:` publicados, acceso via Traefik, Basic Auth de edge y password de UI obligatoria.
- Headers de seguridad en Traefik (HSTS, frame deny, nosniff, referrer policy, etc).

Limites a considerar:

- `./data/ssh` es compartido por ambos contenedores; protege ese directorio en el host.
- `${HOST_PROJECTS_DIR}` se monta con lectura/escritura; usa rutas controladas en prod.
- Este repo no instala Traefik; asume que ya existe y esta endurecido (`exposedByDefault=false`, redirect HTTP->HTTPS, etc).

## Troubleshooting

### Error: variable obligatoria no definida en prod

Si ves `set_OPENCHAMBER_UI_PASSWORD` o `set_TRAEFIK_BASIC_AUTH_USERS`, define esas variables en `.env.prod` y vuelve a levantar.

### Traefik responde 404

Verifica:

- `OPENCHAMBER_DOMAIN` coincide con el host real
- `TRAEFIK_DOCKER_NETWORK` existe y coincide con la red de Traefik
- el servicio `openchamber` esta levantado y healthy

### OpenChamber no conecta con OpenCode

Verifica:

- `opencode` esta `healthy`
- `OPENCODE_SKIP_START=true`
- `OPENCODE_SERVER_PORT` consistente entre servicios

### Problemas de permisos en `data/` o `projects/`

`./init-data-dirs.sh` prepara ownership. Si aun falla:

```bash
sudo chown -R 1000:1000 ./data ./projects
```

Si usas `HOST_PROJECTS_DIR` custom, reemplaza `./projects` por esa ruta.

### Puerto ocupado en dev

Cambia puertos en `.env.dev`:

```dotenv
OPENCHAMBER_PORT=3001
OPENCODE_SERVER_PORT=4097
OPENCODE_AUX_SERVER_PORT=1456
```

Luego recrea:

```bash
docker compose --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

### Revisar claves SSH compartidas

```bash
docker compose --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml exec opencode ls -la /home/opencode/.ssh
docker compose --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml exec openchamber ls -la /home/openchamber/.ssh
```
