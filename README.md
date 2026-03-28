<img width="300" height="550" alt="OpenChamba" src="https://github.com/user-attachments/assets/8adce41c-7fe6-4607-be0a-c4ef39281e8d" />

# OpenChamba

Stack Docker para ejecutar OpenCode y OpenChamber con workspace compartido, datos persistentes y una configuracion lista para uso local.

## Que es

Este repositorio levanta dos servicios coordinados:

- **OpenCode** como servidor accesible dentro de la red de Compose y publicado en el host por defecto en `127.0.0.1:4096`.
- **OpenChamber** como interfaz web publicada por defecto en `127.0.0.1:3000` y conectada al servicio `opencode` del stack.

El proyecto tambien prepara persistencia para configuracion, cache, estado, workspace y claves SSH compartidas entre ambos contenedores.
Ademas, OpenChamber monta la configuracion real de OpenCode para que los cambios hechos desde la UI impacten al servicio `opencode` del stack.

## Que incluye

| Componente | Version por defecto | Rol |
| --- | --- | --- |
| OpenCode | `1.2.27` | Servicio principal de OpenCode |
| OpenChamber Web | `1.9.1` | Interfaz web para operar el stack |
| OpenSpec | `1.2.0` | CLI `openspec` disponible en la imagen de OpenCode |
| oh-my-opencode-slim | `0.8.3` | Plugin instalado y registrado en OpenCode |
| opencode-plugin-openspec | `0.1.2` | Plugin registrado en la config de OpenCode |

Notas operativas del stack:

- OpenChamber comparte `./data/opencode/config` y `./data/opencode/share` con el servicio `opencode` para editar la misma configuracion efectiva de OpenCode.
- `./data/openchamber/*` sigue reservado para runtime, logs y preferencias propias de OpenChamber.
- `./data/opencode/state` y `./data/opencode/cache` permanecen aislados para no mezclar sockets, locks ni temporales entre contenedores.

## Requisitos

- Docker Engine con soporte para `docker compose`
- Docker Compose Plugin v2
- Bash para ejecutar `./init-data-dirs.sh`
- Puertos disponibles `3000` y `4096`, o variables ajustadas en `.env`
- Permisos para crear y, si hace falta, reasignar ownership sobre `./data` y el directorio configurado en `HOST_PROJECTS_DIR`

## Inicio rapido

```bash
cp .env.example .env
./init-data-dirs.sh
docker compose up -d
docker compose ps
```

Despues del arranque:

- UI de OpenChamber: `http://127.0.0.1:3000`
- Servicio OpenCode: `http://127.0.0.1:4096`

Antes de levantar el stack, revisa al menos estas variables en `.env`:

- `HOST_PROJECTS_DIR`
- `OPENCHAMBER_UI_PASSWORD`
- `OPENCHAMBER_PORT`
- `OPENCODE_SERVER_PORT`

## Configuracion

La configuracion principal vive en `.env`. El archivo `.env.example` ya documenta los valores por defecto y el motivo de cada variable.

| Variable | Default | Uso |
| --- | --- | --- |
| `HOST_PROJECTS_DIR` | `./projects` | Directorio del host que ambos contenedores ven como `/workspace` |
| `OPENCODE_BIND_ADDRESS` | `127.0.0.1` | Address publicado del servicio OpenCode en el host |
| `OPENCODE_SERVER_PORT` | `4096` | Puerto de OpenCode |
| `OPENCODE_AUX_SERVER_PORT` | `1455` | Puerto publicado en el host para servicios auxiliares de OpenCode; el servicio interno sigue escuchando en `1455` |
| `OPENCODE_HOST` | `0.0.0.0` | Host interno donde escucha OpenCode dentro del contenedor |
| `OPENCODE_DISABLE_AUTOUPDATE` | `true` | Desactiva auto updates para builds reproducibles |
| `OPENCHAMBER_BIND_ADDRESS` | `127.0.0.1` | Address publicado de la UI en el host |
| `OPENCHAMBER_PORT` | `3000` | Puerto de OpenChamber |
| `OPENCHAMBER_HOST` | `0.0.0.0` | Host interno donde escucha OpenChamber |
| `OPENCHAMBER_DATA_DIR` | `/home/openchamber/.config/openchamber` | Directorio interno de datos de OpenChamber; `./data/openchamber/config` se monta ahi |
| `OPENCODE_SKIP_START` | `true` | Hace que OpenChamber use el servicio `opencode` del Compose en lugar de iniciar uno embebido |
| `OPENCHAMBER_UI_PASSWORD` | vacia | Password de acceso a la UI; vacia desactiva la autenticacion |

Notas utiles:

- `OPENCHAMBER_UI_PASSWORD` solo aplica si tiene un valor no vacio.
- `HOST_PROJECTS_DIR` puede apuntar a cualquier ruta existente en el host.
- `OPENCHAMBER_DATA_DIR` cambia la ruta interna donde OpenChamber guarda su configuracion y logs; el stack monta `./data/openchamber/config` en esa ruta.
- OpenChamber tambien monta `./data/opencode/config` en `~/.config/opencode` y `./data/opencode/share` en `~/.local/share/opencode` para que la UI y el servicio `opencode` usen la misma configuracion efectiva.
- El contenedor `openchamber` no instala el CLI de OpenCode. Para evitar un preflight de upstream que aun busca `opencode` en `PATH` incluso con `OPENCODE_SKIP_START=true`, el Compose fija `OPENCODE_BINARY=/bin/true`. Eso solo sirve para pasar la validacion inicial; OpenChamber sigue usando el servicio `opencode` separado del stack.
- El boton `Restart OpenCode and reload configuration` de la UI reinicia el proceso solo cuando OpenChamber administra un OpenCode embebido. En este stack, con `OPENCODE_SKIP_START=true`, OpenChamber trata a OpenCode como externo: el boton vuelve a sondear el backend y refresca el estado de la UI, pero no reinicia el contenedor `opencode`.
- Si cambias puertos, actualiza `.env` antes de volver a levantar el stack.

Si necesitas ejecutar OpenChamber sin password, deja `OPENCHAMBER_UI_PASSWORD` vacia:

```dotenv
OPENCHAMBER_UI_PASSWORD=
```

Eso desactiva la autenticacion de la UI. Usalo solo para desarrollo local descartable.

## Plugins incluidos

### oh-my-opencode-slim

[`oh-my-opencode-slim`](https://github.com/alvinunreal/oh-my-opencode-slim) queda integrado por defecto y agrega una capa de trabajo multiagente sobre OpenCode.

- Su agente principal es `orchestrator`.
- `orchestrator` analiza cada pedido y decide si conviene resolverlo directamente o delegarlo.
- El flujo esta pensado para optimizar calidad, velocidad, costo y confiabilidad usando especialistas cuando aporta valor.
- Agentes incluidos por defecto: `explorer`, `librarian`, `oracle`, `designer` y `fixer`.

### OpenSpec

[`OpenSpec`](https://openspec.dev/) agrega un flujo de Spec-Driven Development (SDD) para planificar cambios mediante propuestas, diseno y tareas antes de implementar.

El CLI `openspec` queda disponible dentro del contenedor `opencode`.

### opencode-plugin-openspec

[`opencode-plugin-openspec`](https://github.com/Octane0411/opencode-plugin-openspec) integra OpenSpec dentro de OpenCode y agrega el soporte para trabajar el flujo de planificacion de specs desde el entorno del agente.

## Uso de OpenSpec SDD

Tener OpenSpec preinstalado no inicializa automaticamente el flujo de trabajo en cada proyecto. Para usar el flujo SDD en un proyecto, primero hay que ejecutar manualmente `openspec init` en la raiz del repo.

Ejemplo desde el host:

```bash
docker compose exec opencode sh -lc 'cd /workspace/mi-proyecto && openspec init'
```

O, si ya estas dentro del contenedor `opencode`, desde la raiz del proyecto:

```bash
openspec init
```

Sin ese paso, el proyecto no queda preparado para trabajar con OpenSpec y el flujo SDD.

Despues de `openspec init`, el proyecto queda listo para usar los comandos CLI habituales de OpenSpec, por ejemplo:

- `openspec list`
- `openspec show`
- `openspec validate`
- `openspec status`
- `openspec archive`
- `openspec update`

Lista de comandos disponibles en el chat del agente:

- `/opsx:propose`
- `/opsx:explore`
- `/opsx:apply`
- `/opsx:archive`

## Arquitectura

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
        |                                                            |
        +------------------- /workspace ------------------------------+
        +--------------------- ./data/ssh ----------------------------+
```

Relaciones importantes:

- `openchamber` depende de que `opencode` este `healthy` antes de iniciar.
- Ambos contenedores montan el mismo workspace del host en `/workspace`.
- Ambos comparten `./data/ssh`, donde se genera una clave `ed25519` si no existe.
- OpenChamber usa `http://opencode:<puerto>` dentro de la red de Compose.

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

Mapeos persistentes del stack:

- `./data/opencode/config` -> `/home/opencode/.config/opencode`
- `./data/opencode/share` -> `/home/opencode/.local/share/opencode`
- `./data/opencode/state` -> `/home/opencode/.local/state/opencode`
- `./data/opencode/cache` -> `/home/opencode/.cache/opencode`
- `./data/openchamber/config` -> `${OPENCHAMBER_DATA_DIR}` (default `/home/openchamber/.config/openchamber`)
- `./data/openchamber/share` -> `/home/openchamber/.local/share/openchamber`
- `./data/openchamber/state` -> `/home/openchamber/.local/state/openchamber`
- `./data/openchamber/cache` -> `/home/openchamber/.cache/openchamber`
- `./data/opencode/config` -> `/home/openchamber/.config/opencode`
- `./data/opencode/share` -> `/home/openchamber/.local/share/opencode`
- `./data/ssh` -> `~/.ssh` en ambos contenedores
- `${HOST_PROJECTS_DIR}` -> `/workspace` en ambos contenedores

Con este montaje cruzado, la configuracion de OpenCode modificada desde la UI de OpenChamber cae en los mismos archivos que consume el servicio `opencode`. El estado y la cache permanecen separados para evitar conflictos de runtime.

`./init-data-dirs.sh` crea estos directorios y, si corresponde, ajusta ownership a `1000:1000`.

## Operacion diaria

### Levantar el stack

```bash
docker compose up -d
```

### Ver estado

```bash
docker compose ps
```

### Ver logs

```bash
docker compose logs -f
docker compose logs -f opencode
docker compose logs -f openchamber
```

### Detener el stack

```bash
docker compose down
```

### Reconstruir imagenes

```bash
docker compose build
docker compose up -d
```

### Entrar a un contenedor

```bash
docker compose exec opencode bash
docker compose exec openchamber bash
```

## Usar OpenCode desde terminal

Si prefieres trabajar directamente con la terminal de OpenCode en lugar de la interfaz web de OpenChamber, puedes entrar al contenedor `opencode` y operar desde ahi.

Flujo recomendado:

```bash
docker compose exec opencode bash
cd /workspace/mi-proyecto
opencode
```

Notas utiles:

- El contenedor `opencode` ya incluye el binario `opencode` en el PATH.
- El servicio principal del contenedor sigue corriendo como `opencode serve`; abrir una shell con `docker compose exec` no lo reemplaza.
- Tus repos del host quedan disponibles dentro del contenedor en `/workspace`.
- La configuracion y el estado de OpenCode persisten en `./data/opencode/`.
- Si vas a usar OpenSpec en un repo desde terminal, recuerda inicializarlo primero con `openspec init` en la raiz del proyecto.

## Seguridad

El stack publica ambos servicios en `127.0.0.1` por defecto, exige password para la UI de OpenChamber, ejecuta los contenedores con usuarios no root y crea `~/.ssh` con permisos restrictivos.

Limites importantes:

- La password de OpenChamber viaja como variable de entorno del contenedor.
- No hay TLS configurado en este repositorio.
- El repo no define autenticacion adicional para el servicio OpenCode expuesto en el host.
- `oh-my-opencode-slim` y `opencode-plugin-openspec` quedan preinstalados en `opencode`, no como componentes separados de `openchamber`.
- Ejecutar OpenChamber sin password es posible dejando `OPENCHAMBER_UI_PASSWORD` vacia; no es recomendable fuera de entornos locales temporales.

## Troubleshooting

### OpenChamber sigue pidiendo password

Define una password en `.env` si quieres proteger la UI:

```dotenv
OPENCHAMBER_UI_PASSWORD=tu-password
```

o, solo para desarrollo local descartable:

```dotenv
OPENCHAMBER_UI_PASSWORD=
```

Despues recrea el contenedor para que tome el nuevo valor del entorno.

### Problemas de permisos en `data/` o `projects/`

`./init-data-dirs.sh` intenta preparar ownership para los usuarios del contenedor. Si aun asi el contenedor no puede escribir:

```bash
sudo chown -R 1000:1000 ./data ./projects
```

Si usas un `HOST_PROJECTS_DIR` personalizado, reemplaza `./projects` por esa ruta.

### OpenChamber no conecta con OpenCode

Verifica:

- `docker compose ps`
- que `opencode` este `healthy`
- que `OPENCODE_SKIP_START=true`
- que `OPENCODE_SERVER_PORT` sea consistente entre servicios

### Puerto ocupado

Si `3000` o `4096` ya estan en uso, cambia los valores en `.env`:

```dotenv
OPENCHAMBER_PORT=3001
OPENCODE_SERVER_PORT=4097
```

Luego vuelve a levantar el stack.

### SSH compartido

Los dos contenedores usan `./data/ssh`. Si necesitas inspeccionar la clave generada:

```bash
docker compose exec opencode ls -la /home/opencode/.ssh
docker compose exec openchamber ls -la /home/openchamber/.ssh
```
