export const ES_MANUAL = `
# anyIP CLI — Manual de usuario

## Descripción general

anyIP.io ofrece proxies residenciales y móviles para web scraping, automatización y
recopilación de datos. Este CLI te permite gestionar cuentas proxy, monitorear el ancho
de banda, crear sesiones y generar configuraciones completas usando lenguaje natural —
todo desde tu terminal.

Documentación oficial: https://anyip.io/docs/guides/quick-start

---

## Instalación

### Instalación global (recomendada)
    npm install -g anyip-cli
    anyip --help

### Desde el código fuente
    git clone <repo>
    cd anyip-cli
    npm install
    npm run build
    npm link        # hace que 'anyip' esté disponible globalmente

### Sin instalación (uso puntual)
    npx anyip-cli <comando>

---

## Configuración inicial

### Opción A — Solicitud interactiva (las claves no se guardan en el historial del shell)
    anyip config set-keys

### Opción B — Indicadores
    anyip config set-keys --anyip TU_CLAVE_ANYIP --claude TU_CLAVE_CLAUDE

### Opción C — Variables de entorno (ideal para CI/CD)
    export ANYIP_API_KEY=tu_clave_anyip
    export ANTHROPIC_API_KEY=tu_clave_claude

Las variables de entorno siempre tienen prioridad sobre la configuración almacenada.

La clave de Claude es opcional — solo es necesaria para: anyip generate, anyip man (idiomas distintos al inglés)

### Ver configuración almacenada
    anyip config show          # muestra las claves enmascaradas + ruta del archivo de config

### Borrar configuración almacenada
    anyip config clear

---

## Gestión de cuentas

    anyip account              # listar todas las cuentas proxy (vista de tabla)
    anyip account me           # mostrar información y cuota de tu cuenta anyIP
    anyip account list         # alias de la tabla anterior
    anyip account list --json  # salida JSON legible por máquina
    anyip account inspect <id>             # tarjeta de detalle completo de una cuenta
    anyip account inspect <id> --json      # salida JSON
    anyip account create -d "Mi proxy" --type residential --country ES
    anyip account enable <id>
    anyip account disable <id>
    anyip account bulk-reset               # restablecer todas las cuotas de ancho de banda (pide confirmación)
    anyip account bulk-reset --yes         # omitir confirmación (para scripts)

### Opciones de creación
    -d, --description <texto>  Requerido. Etiqueta para esta cuenta proxy
    --type <tipo>              residential | mobile
    --country <código>         Código ISO, ej. ES, US, MX, AR
    --region <nombre>          Estado o región (minúsculas), ej. cataluna
    --city <nombre>            Ciudad (minúsculas), ej. madrid
    --session <nombre>         Nombre de sesión fija (alfanumérico + guion bajo)
    --sess-time <minutos>      Duración de sesión 1–10080 (predeterminado: 7 días)
    --quota <bytes>            Límite de ancho de banda en bytes (predeterminado: 1 GB = 1073741824)
    --password <contra>        Contraseña personalizada (se genera automáticamente si se omite)

---

## Gestión de sesiones

Las sesiones son configuraciones de conexión proxy guardadas localmente. El comando \`get\`
encuentra o crea una y la prueba con una verificación curl en vivo.

### Buscar / crear / probar una sesión proxy
    anyip get                                    # usar la primera cuenta proxy, móvil, socks5
    anyip get --residential --location ES        # proxy residencial español
    anyip get --mobile --location MX             # proxy móvil mexicano
    anyip get --residential --rotating           # IP rotativa (nueva IP por conexión)
    anyip get --residential --time 30            # sesión fija de 30 minutos
    anyip get --user 2                           # usar cuenta proxy n.º 2 (ver: anyip account)
    anyip get --list                             # mostrar sesiones coincidentes sin hacer curl

### Gestionar sesiones guardadas
    anyip proxy list                  # todas las sesiones guardadas
    anyip proxy list --user 1         # sesiones pertenecientes a la cuenta proxy n.º 1
    anyip proxy get <nombre>          # tarjeta de detalle completo de una sesión
    anyip proxy curl <nombre>         # imprimir el comando curl de prueba
    anyip proxy curl <nombre> --run   # ejecutar la prueba curl
    anyip proxy add servidor:puerto:usuario:contraseña   # importar desde cadena de conexión
    anyip proxy import proxies.txt    # importación masiva (una cadena de conexión por línea)
    anyip proxy delete <nombre>       # eliminar una sesión guardada
    anyip proxy clear                 # eliminar todas las sesiones (pide confirmación)

---

## Monitoreo de tráfico

    anyip traffic list                            # tráfico reciente agrupado por día
    anyip traffic list --from 2024-01-01          # filtrar por fecha de inicio
    anyip traffic list --to 2024-01-31            # filtrar por fecha de fin
    anyip traffic list --proxy <id>               # filtrar por ID de cuenta proxy
    anyip traffic list --json                     # salida JSON
    anyip traffic export                          # imprimir CSV en la salida estándar
    anyip traffic export -o trafico.csv           # guardar en archivo
    anyip traffic export --from 2024-01-01 -o ene.csv

---

## Datos geográficos de referencia

    anyip data countries               # todos los países disponibles
    anyip data countries --json        # salida JSON
    anyip data regions ES              # regiones disponibles para España
    anyip data regions MX --json
    anyip data asn ES                  # ASNs de ISP/operadores para España

Usa estos comandos para descubrir valores válidos para --country, --region y filtrado ASN.

---

## Prueba rápida de proxy

    anyip check 1     # comprobar la cuenta proxy n.º 1 — obtiene información IP via ip-api.com

---

## Generador de proxy con IA

Describe tu caso de uso en lenguaje natural. Claude lo analiza y crea automáticamente
el conjunto óptimo de cuentas proxy.

    # Descripción en línea
    anyip generate "scraping de precios de Amazon en 5 ciudades españolas, IPs rotativas"

    # Solicitud interactiva (sin argumentos = pide una descripción)
    anyip generate

    # Previsualizar el plan sin crear nada
    anyip generate "10 cuentas de Instagram en México, sesiones fijas" --dry-run

    # Guardar la lista de credenciales en un archivo
    anyip generate "proxies residenciales ES para monitoreo SEO" --output proxies.txt

El generador también guarda todas las sesiones creadas localmente para que puedas
usar inmediatamente \`anyip get\` o \`anyip proxy list\`.

---

## Panel de control web

Lanza una interfaz gráfica local en tu navegador para gestionar proxies visualmente:

    anyip serve               # abre http://127.0.0.1:3000 en tu navegador
    anyip serve --port 8080   # puerto personalizado

Presiona Ctrl+C para detener el servidor. El panel incluye:
- Lista de cuentas con botones activar/desactivar
- Formulario del generador de proxy con IA
- Resumen de tráfico
- Visor de sesiones

---

## Manual

    anyip man                  # mostrar este manual (inglés)
    anyip man --language es    # Español
    anyip man --language fr    # Francés
    anyip man --language zh    # Chino (中文)
    anyip man --language ru    # Ruso (Русский)

---

## Formato de URL proxy

    http://USUARIO:CONTRASEÑA@gate.anyip.io:8080      (proxy HTTP)
    socks5://USUARIO:CONTRASEÑA@portal.anyip.io:1080  (proxy SOCKS5)

Con atributos de sesión integrados en el nombre de usuario:

    http://user_CUENTA,type_residential,country_ES,session_mi_sesion:CONTRASEÑA@gate.anyip.io:8080

Atributos (separados por comas en el campo de nombre de usuario):
    user_XXXX       identificador de cuenta proxy
    type_XXX        residential | mobile
    country_XX      código de país ISO
    region_XXX      slug de región/estado
    city_XXX        slug de ciudad
    session_NOMBRE  etiqueta de sesión fija (omitir para rotación)
    sesstime_N      duración de sesión en minutos

---

## Variables de entorno

    ANYIP_API_KEY        Clave API de anyIP.io (reemplaza la configuración almacenada)
    ANTHROPIC_API_KEY    Clave API de Claude (reemplaza la configuración almacenada)
    NO_COLOR             Definir con cualquier valor para desactivar la salida con colores

---

## Consejos

- Usa \`--json\` en cualquier comando de datos para redirigir la salida: \`anyip account list --json | jq '.[].username'\`
- El comando \`anyip get\` recuerda las sesiones localmente — ejecútalo una vez, reutiliza la sesión
- Para scraping: usa \`--rotating\` (nueva IP por conexión, más rápido para tareas sin estado)
- Para gestión de cuentas: usa \`--session NOMBRE\` para fijar una IP por cuenta
- Para CI/CD: define \`ANYIP_API_KEY\` como secreto, omite \`anyip config set-keys\`
- Cuota en bytes: 1 GB = 1073741824, 5 GB = 5368709120, 10 GB = 10737418240
`;
