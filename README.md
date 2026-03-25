<img width="300" height="550" alt="OpenChamba" src="https://github.com/user-attachments/assets/8adce41c-7fe6-4607-be0a-c4ef39281e8d" />

# OpenChamba

Stack Docker para ejecutar OpenCode y OpenChamber con workspace compartido, persistencia y una experiencia mas completa desde el primer arranque: plugins incluidos por defecto y soporte para Spec-Driven Development con OpenSpec.

El repo incluye dos modos de uso:

- **Desarrollo local** en `localhost`.
- **Deploy en VPS** mediante `docker-compose.prod.yml`.

Cuando en esta documentacion se menciona `prod` o `produccion`, se refiere a ese escenario de despliegue en servidor usando el override incluido, no a una infraestructura unica u oficial.

## Que es

OpenChamba busca que puedas levantar un entorno funcional rapido, pero sin quedarte en un Compose minimo. La idea es darte una base de trabajo util para desarrollo asistido por agentes, con persistencia, plugins y una integracion directa con OpenSpec.

Este repositorio levanta dos servicios coordinados:

- **OpenCode** como servicio backend dentro de la red interna de Compose.
- **OpenChamber** como UI web conectada al servicio `opencode`.

Ambos contenedores comparten:

- un workspace comun (`/workspace`)
- persistencia de configuracion, cache, estado y datos de aplicacion
- un directorio `~/.ssh` comun (`./data/ssh`)

## Que incluye

### Stack base

| Componente | Version por defecto | Rol |
| --- | --- | --- |
| OpenCode | `1.3.2` | Servicio principal |
| OpenChamber Web | `1.9.1` | Interfaz web |
| OpenSpec | `1.2.0` | CLI `openspec` en imagen de OpenCode |
| oh-my-opencode-slim | `0.8.4` | Plugin para flujo multiagente |
| opencode-plugin-openspec | `0.1.4` | Integracion de OpenSpec en OpenCode |

Nota: la imagen de `openchamber` tambien instala `opencode-ai@1.3.2` y `opencode-linux-x64@1.3.2` como dependencia interna de esa UI.

### Plugins y flujo SDD incluidos

Una parte importante de la identidad de OpenChamba es que no se limita a levantar OpenCode + OpenChamber: tambien te deja lista una base de trabajo mas opinionada para agentes, plugins y Spec-Driven Development.

- `oh-my-opencode-slim` agrega un flujo multiagente listo para usar.
- `opencode-plugin-openspec` integra OpenSpec dentro de OpenCode.
- `openspec` queda disponible en el contenedor `opencode` para trabajar con SDD desde terminal.

Agentes incluidos por `oh-my-opencode-slim`:

- `orchestrator`
- `explorer`
- `librarian`
- `oracle`
- `designer`
- `fixer`

## Modos de uso

| Modo | Archivos Compose | Exposicion | Uso recomendado |
| --- | --- | --- | --- |
| Dev | `docker-compose.yml` + `docker-compose.dev.yml` | Puertos en `127.0.0.1` | Desarrollo local |
| Deploy VPS | `docker-compose.yml` + `docker-compose.prod.yml` | Sin `ports`, acceso via reverse proxy | Servidor remoto |

Nota sobre infraestructura:

- Este repo incluye un ejemplo de despliegue en VPS usando labels de Traefik.
- Traefik no es obligatorio: es la implementacion de referencia que acompana este stack.
- La capa de routing, acceso y seguridad depende de cada entorno.
- Por ejemplo, podes usar Traefik + Cloudflare Zero Trust, otro reverse proxy, una VPN, un tunnel o cualquier otra estrategia de exposicion.

## Por que este stack

- Levanta OpenCode y OpenChamber ya conectados entre si.
- Mantiene workspace, estado y configuracion persistentes entre reinicios.
- Te deja plugins utiles preinstalados desde el inicio.
- Incorpora OpenSpec como parte del flujo de trabajo, no como agregado posterior.
- Lo podes usar tanto en local como en un servidor remoto sin cambiar la base del stack.

## Archivos principales

- `docker-compose.yml`: base comun del stack.
- `docker-compose.dev.yml`: override para desarrollo local con puertos publicados en localhost.
- `docker-compose.prod.yml`: override orientado a deploy en VPS detras de un reverse proxy, sin `ports` publicados.
- `.env.dev.example`: plantilla para desarrollo local.
- `.env.prod.example`: plantilla para deploy en servidor.
- `.env.example`: referencia general de variables del stack.

## Requisitos

Generales:

- Docker Engine con `docker compose`
- Docker Compose Plugin v2
- Bash para ejecutar `./init-data-dirs.sh`
- permisos para crear y ajustar ownership de `./data` y `HOST_PROJECTS_DIR`

Requisitos para el ejemplo de deploy en VPS:

- un VPS o Docker host accesible
- un reverse proxy o capa de exposicion a tu eleccion
- si usas el override incluido sin cambios, Traefik funcionando en el host o en el mismo Docker host
- si usas Traefik, una red Docker externa para Traefik (default: `traefik-public`)
- DNS del dominio apuntando al VPS
- si usas TLS automatico con Traefik, un certresolver configurado

## Inicio rapido (desarrollo local)

```bash
cp .env.dev.example .env.dev
./init-data-dirs.sh
docker compose --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml up -d --build
docker compose --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml ps
```

Acceso esperado:

- OpenChamber UI: `http://127.0.0.1:3000`
- OpenCode API: `http://127.0.0.1:4096`
- Puerto auxiliar OpenCode: `127.0.0.1:${OPENCODE_AUX_SERVER_PORT}`

## Inicio rapido (deploy en VPS)

1) Preparar variables del servidor

```bash
cp .env.prod.example .env.prod
```

2) Editar `.env.prod` y definir al menos:

- `OPENCHAMBER_UI_PASSWORD`
- `OPENCHAMBER_DOMAIN`
- `TRAEFIK_CERTRESOLVER` si vas a usar el ejemplo con Traefik

3) Si vas a usar Traefik con la configuracion incluida, crear la red externa si no existe

```bash
docker network create traefik-public || true
```

4) Inicializar directorios y levantar el stack

```bash
./init-data-dirs.sh
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml ps
```

Acceso esperado con el ejemplo incluido:

- `https://openchamba.online` via Traefik
- `openchamber` no publica puertos al host
- `opencode` queda solo en red interna

## OpenSpec y Spec-Driven Development

OpenSpec no aparece aca como un extra: forma parte de la experiencia que propone OpenChamba. El stack ya deja disponible el CLI `openspec` dentro del contenedor `opencode`, listo para trabajar con una metodologia SDD sobre los repos montados en `/workspace`.

OpenSpec viene preinstalado, pero no inicializa automaticamente cada proyecto. Tenes que ejecutar `openspec init` en la raiz del repo con el que quieras trabajar.

Ejemplo:

```bash
docker compose --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml exec opencode sh -lc 'cd /workspace/mi-proyecto && openspec init'
```

Comandos CLI utiles despues de `init`:

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

```bash
docker compose --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml exec opencode bash
cd /workspace/mi-proyecto
opencode
```

Notas:

- el binario `opencode` ya esta en el `PATH`
- el servicio principal sigue corriendo como `opencode serve`
- los repos del host quedan disponibles en `/workspace`

## Variables importantes

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
| `OPENCHAMBER_UI_PASSWORD` | vacia en dev / requerida en deploy VPS | Password de la UI de OpenChamber |
| `NODE_ENV` | segun override (`development`/`production`) | Entorno de ejecucion |

### Variables solo dev

| Variable | Default | Uso |
| --- | --- | --- |
| `OPENCODE_BIND_ADDRESS` | `127.0.0.1` | Address host para publicar OpenCode |
| `OPENCODE_AUX_SERVER_PORT` | `1455` | Puerto host para servicio auxiliar de OpenCode |
| `OPENCHAMBER_BIND_ADDRESS` | `127.0.0.1` | Address host para publicar OpenChamber |

### Variables del override de deploy en VPS

| Variable | Default ejemplo | Uso |
| --- | --- | --- |
| `OPENCHAMBER_DOMAIN` | `openchamba.online` | Host rule del ejemplo con Traefik |
| `TRAEFIK_ENTRYPOINT` | `websecure` | Entrypoint HTTPS en Traefik |
| `TRAEFIK_CERTRESOLVER` | `letsencrypt` | Resolver ACME de Traefik |
| `TRAEFIK_DOCKER_NETWORK` | `traefik-public` | Red Docker que Traefik usa para reachability |

Notas utiles:

- en el override de deploy, Compose falla si falta `OPENCHAMBER_UI_PASSWORD`
- `OPENCODE_AUX_SERVER_PORT` solo afecta el mapeo host->contenedor en dev; no cambia el puerto interno `1455`
- `host.docker.internal` se agrega solo en dev para compatibilidad local

## Persistencia

Directorios persistentes principales:

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

Mapeos clave:

- `./data/opencode/config` -> `/home/opencode/.config/opencode`
- `./data/openchamber/config` -> `${OPENCHAMBER_DATA_DIR}`
- `./data/ssh` -> `~/.ssh` en ambos contenedores
- `${HOST_PROJECTS_DIR}` -> `/workspace` en ambos contenedores

`./init-data-dirs.sh` crea estos directorios e intenta ajustar ownership a `1000:1000`.

## Operacion diaria

Helpers utiles:

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

# Reinicio / stop
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

## Seguridad y alcance del ejemplo de deploy

Medidas aplicadas en el stack:

- contenedores ejecutan con usuarios no root (`opencode` / `openchamber`)
- `security_opt: no-new-privileges:true`
- `cap_drop: [ALL]`
- `pids_limit: 512`
- rotacion de logs (`json-file`, `10m`, `3` archivos)
- healthchecks activos para ambos servicios
- en el override de deploy: sin `ports:` publicados y password de UI obligatoria
- si usas el ejemplo con Traefik: headers de seguridad via labels

Alcance de este repo:

- no instala Traefik por ti
- no configura Cloudflare Zero Trust ni otra capa de acceso externo
- no impone una unica estrategia de exposicion o seguridad

Si en tu entorno usas Traefik + Cloudflare Zero Trust, eso encaja bien con este stack, pero sigue siendo una implementacion personal y reemplazable por cualquier otra infraestructura equivalente.

## Troubleshooting

### Error: variable obligatoria no definida en deploy

Si ves `set_OPENCHAMBER_UI_PASSWORD`, define esa variable en `.env.prod` y vuelve a levantar.

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
