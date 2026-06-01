# textoVozFlaskReact

Aplicación web para convertir archivos de texto a audio usando **gTTS** (Google Text-to-Speech) o **Gemini TTS**. Todo se procesa en el backend Flask, el frontend React se sirve como estático.

Incluye modo **claro/oscuro**, barra de **progreso en tiempo real**, **fusión de melodía de fondo**, **fade-out automático**, **límite configurable** de tamaño de archivo y despliegue vía **Docker**.

---

## Requisitos

- **Docker** y **Docker Compose** (recomendado)
- O bien: **Python 3.10+**, **Node.js 18+**, **FFmpeg**

---

## Cómo ejecutar

### Opción 1 — Docker (recomendado para servidor)

> **Nota:** El `docker-compose.yml` incluye integración con **Traefik** (proxy inverso + SSL).
> Para entornos **sin Traefik** (ej. desarrollo local), usa el override de abajo.

```bash
# 1. Crear la red que Traefik espera (solo la primera vez)
docker network create traefik-net

# 2. Construir imagen e iniciar contenedor
docker compose up -d

# 3. Ver logs
docker compose logs -f

# 4. Detener
docker compose down

# 5. Reconstruir tras cambios en código
docker compose up -d --build

# 6. Reconstruir tras cambios en config.json (sin rebuild)
docker compose restart
```

Abrir `http://localhost:8080`.

#### Sin Traefik (desarrollo local)

Crea un archivo `docker-compose.override.yml` en la raíz con este contenido:

```yaml
services:
  app:
    networks: []
    labels: []

networks: {}
```

Luego ejecuta los mismos comandos de arriba. Docker combinará ambos archivos automáticamente.

O alternativamente, usa el comando directo sin compose:

```bash
docker build -t textovoz . && docker run -d -p 8080:8080 -v ./config.json:/app/config.json:ro textovoz
```

El archivo `config.json` se monta como volumen de solo lectura,  
por lo que puedes editarlo y reiniciar el contenedor sin reconstruir la imagen.

```bash
# 1. Editar config.json
# 2. Reiniciar contenedor
docker compose restart
```

### Opción 2 — Un clic

**Windows:** Ejecutar `start.bat`

```bat
start.bat
```

**Linux:** Ejecutar `start.sh`

```bash
./start.sh
```

Esto instala dependencias Python, dependencias Node, compila el frontend React e inicia Flask.

### Opción 3 — Manual paso a paso

```bash
# 1. Dependencias Python
pip install -r backend/requirements.txt

# 2. Dependencias Node
cd frontend
npm install

# 3. Compilar React
npm run build
cd ..

# 4. Iniciar servidor
python backend/app.py
```

Abrir `http://localhost:8080` en el navegador.

### Desarrollo (hot reload)

```bash
# Terminal 1: Flask
python backend/app.py

# Terminal 2: Vite dev server (con proxy a Flask)
cd frontend
npm run dev
```

Abrir `http://localhost:5173` — los cambios en React se reflejan al instante.

---

## Cómo funciona

```
Usuario → [React] → POST /api/tts → [Flask] → tarea async → gTTS / Gemini → audio MP3 → download
                         ↑ polling cada 300 ms por progreso %
                         └── GET /api/tts/{task_id} ← { status, progress, error }
```

1. El usuario selecciona un archivo `.txt` (o escribe texto directamente)
2. Elige el motor: **gTTS** (no requiere clave) o **Gemini TTS** (requiere API Key de Google)
3. El frontend envía el texto + motor + API key a `POST /api/tts` y recibe un `task_id`
4. Flask inicia un hilo en segundo plano y devuelve `202 Accepted` con el `task_id`
5. El frontend consulta `GET /api/tts/{task_id}` cada 300 ms para obtener el progreso
6. Cuando el estado es `completed`, descarga el audio desde `GET /api/tts/{task_id}/download`
7. El frontend muestra un reproductor para escuchar y descargar el resultado

### Melodía de fondo

- Opcionalmente se puede subir un archivo `.mp3` como melodía de fondo
- Se fusiona automáticamente con la voz generada, a volumen reducido (30 %)
- Si la melodía es más corta que la voz, se repite en loop hasta cubrir la duración
- Si no se sube melodía, el audio se genera sin fondo musical

### Fade-out

- El audio generado aplica un **fade-out de 3 segundos** al final
- Evita cortes abruptos al terminar la reproducción
- Se ajusta automáticamente si el audio dura menos de 3 segundos

### gTTS

- Usa la librería `gtts` de Python
- No requiere API key
- Voz estándar de Google Traductor
- Ideal para textos cortos y rápidos

### Gemini TTS

- Usa la API de Google Gemini (`google-genai` SDK)
- Requiere API Key de [Google AI Studio](https://aistudio.google.com/apikey)
- Voz natural con el modelo `gemini-3.1-flash-tts-preview`
- Divide textos largos en segmentos de 2500 caracteres
- El progreso avanza por cada segmento procesado

---

## Funcionalidades

### Barra de progreso

Al generar audio aparece un overlay con:

- Animación de barras ondulantes (esmeralda/índigo)
- Texto "Construyendo audio..."
- **Barra de progreso** con porcentaje exacto en tiempo real

El backend reporta el progreso real:

- **gTTS**: avance interno (5% → 50% → 100%)
- **Gemini TTS**: avance por cada segmento de 2500 caracteres

### Límite de tamaño de archivo

Protegido en frontend y backend. Configurable en `config.json`:

```json
{
  "max_file_size": 10485760
}
```

O vía variable de entorno (tiene prioridad sobre `config.json`):

```bash
export MAX_FILE_SIZE=10485760
python backend/app.py
```

Valor por defecto: **5 MB** (5242880 bytes).

---

## Configuración

Todas las opciones se definen en **`config.json`** en la raíz del proyecto.  
Las variables de entorno tienen prioridad sobre el archivo.

| Campo                   | Default                     | Descripción                              |
|-------------------------|-----------------------------|------------------------------------------|
| `port`                  | `8080`                      | Puerto del servidor Flask                |
| `max_file_size`         | `5242880` (5 MB)            | Tamaño máximo de archivo en bytes        |
| `max_chars_per_chunk`   | `2500`                      | Caracteres por segmento (Gemini TTS)     |
| `gemini_model`          | `gemini-3.1-flash-tts-preview` | Modelo de Gemini para TTS             |
| `gemini_voice`          | `Kore`                      | Voz de Gemini (Kore, Puck, etc.)         |
| `rate_limit`            | `10 per minute`             | Límite de solicitudes por IP             |
| `turnstile_site_key`    | `""`                        | Site key de Cloudflare Turnstile         |
| `turnstile_secret_key`  | `""`                        | Secret key de Cloudflare Turnstile       |

Ejemplo de `config.json` con valores personalizados:

```json
{
  "port": 8080,
  "max_file_size": 10485760,
  "max_chars_per_chunk": 3000,
  "gemini_model": "gemini-3.1-flash-tts-preview",
  "gemini_voice": "Puck",
  "rate_limit": "20 per minute",
  "turnstile_site_key": "0x4AAAA...",
  "turnstile_secret_key": "0x4AAAA..."
}
```

> **Cloudflare Turnstile:** Para obtener tus keys, ve a [dash.cloudflare.com](https://dash.cloudflare.com/) → cuenta → **Turnstile** → **Add Site**. Ingresa tu dominio, selecciona "Invisible" o "Non-interactive", y copia el **Site Key** y **Secret Key** a `config.json`. Si están vacíos, la verificación se omite automáticamente.

> El rate limit usa formato [`flask-limiter`](https://flask-limiter.readthedocs.io/). Ejemplos: `"5 per minute"`, `"100 per hour"`, `"1 per second"`.

> En Docker, `config.json` se monta como volumen de solo lectura, por lo que se puede editar sin reconstruir la imagen.

---

### Notas sobre el build de Docker

#### 1. Ruta del build de Vite

Vite está configurado con `outDir: '../backend/static'`. En el `Dockerfile`, el stage `frontend` construye desde `/build/frontend`, por lo que el output queda en `/build/backend/static/`. El stage `python` debe copiar desde esa ruta:

```dockerfile
COPY --from=frontend /build/backend/static/ ./backend/static/
```

#### 2. Flask resuelve `static_folder` relativo al módulo

Flask resuelve `static_folder="static"` de forma relativa a `root_path` — el directorio donde está `app.py` (`backend/`). Por eso el `Dockerfile` debe copiar el build a `./backend/static/` y no a `./static/`.

#### 3. Rutas catch-all para SPA

Al usar `static_url_path=""` en Flask se genera un conflicto entre la ruta estática y las rutas explícitas de la aplicación. La solución es usar una ruta catch-all con `send_from_directory` para servir assets y `send_static_file("index.html")` como fallback:

```python
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def catch_all(path):
    if path.startswith("api/"):
        return jsonify({"error": "Not found"}), 404
    if path:
        full_path = os.path.join(app.static_folder, path)
        if os.path.isfile(full_path):
            return send_from_directory(app.static_folder, path)
    return app.send_static_file("index.html")
```

### Modo claro / oscuro

- Toggle con iconos de sol/luna en la barra de navegación
- Persiste la preferencia en `localStorage`
- Respeta la preferencia del sistema (`prefers-color-scheme`)
- Esquema de colores profesional con acentos esmeralda e índigo

---

## Variables de entorno

Tienen prioridad sobre `config.json`.

| Variable                 | Default       | Descripción                              |
|--------------------------|---------------|------------------------------------------|
| `PORT`                   | `8080`        | Puerto del servidor Flask                |
| `MAX_FILE_SIZE`          | `5242880`     | Tamaño máximo de archivo en bytes        |
| `MAX_CHARS_PER_CHUNK`    | `2500`        | Caracteres por segmento (Gemini TTS)     |
| `GEMINI_MODEL`           | `gemini-3.1-flash-tts-preview` | Modelo de Gemini para TTS     |
| `GEMINI_VOICE`           | `Kore`        | Voz de Gemini                             |
| `RATE_LIMIT`             | `10 per minute` | Límite de solicitudes por IP            |
| `CONFIG_PATH`            | `config.json`    | Ruta al archivo de configuración       |
| `TURNSTILE_SITE_KEY`     | `""`          | Site key de Cloudflare Turnstile         |
| `TURNSTILE_SECRET_KEY`   | `""`          | Secret key de Cloudflare Turnstile       |

---

## Estructura del proyecto

```
textoVozFront/
├── backend/
│   ├── app.py              # Servidor Flask + lógica TTS + tareas async
│   ├── requirements.txt    # Dependencias Python
│   └── static/             # Build de React (generado por Vite)
├── frontend/
│   ├── src/
│   │   ├── App.jsx         # Componente principal (React)
│   │   ├── App.css         # Estilos con variables CSS + temas
│   │   └── main.jsx        # Entry point React
│   ├── index.html          # Template HTML
│   ├── vite.config.js      # Configuración Vite
│   └── package.json        # Dependencias Node
├── config.json             # Configuración central (editable)
├── Dockerfile              # Build multi-etapa (Node → Python)
├── docker-compose.yml      # Orquestación Docker
├── .dockerignore
├── .gitignore
├── start.bat               # Script de inicio (Windows)
├── start.sh                # Script de inicio (Linux)
└── README.md
```
