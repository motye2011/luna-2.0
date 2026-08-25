# Luna 2.0

Luna no es un asistente. Es una companera virtual con personalidad emergente: memoria, emociones y 18 rasgos que evolucionan segun lo que vive contigo. Cada conversacion deja huella y cada huella es rastreable: si le preguntas "por que estas tan desconfiada?", puede citar el hecho concreto que la marco.

Corre sobre Ollama, sin APIs externas, sin claves de terceros y sin dependencias externas de Node.

---

## El principio: un solo servidor, muchas ventanas

> **Estado actual:** el servidor todavia no existe. Mientras tanto, Luna corre en local (modo desarrollo).
>
> **Cuando exista:** TODO se regira desde el servidor. Ahi vivera la Luna real — su memoria, su psique y su modelo. Los clientes (la app de escritorio, la CLI) seran solo ventanas para hablar con ella. Nadie tendra una "copia propia": si le dices algo desde el movil o desde otro PC, es la misma Luna la que recuerda, siente y cambia.

```
                    ┌──────────────────────────────┐
                    │         SERVIDOR             │
                    │   (Oracle / VPS / tu PC)     │
                    │                              │
   app Luna.exe ───►│  servidor.js (API + clave)   │
                    │      │                       │
   CLI remota ─────►│      ▼                       │
                    │  index.js + psique.js        │
                    │  memoria.json  registro/     │
                    │      │                       │
                    │      ▼                       │
                    │  Ollama (qwen3:8b)           │
                    └──────────────────────────────┘
```

* La **memoria** (`memoria.json`) y el **registro** viven solo en el servidor.
* **Ollama nunca se expone** a internet: solo la API de Luna, protegida con clave.
* Un cliente sin el servidor no es Luna: es una ventana vacia.

---

## Como funciona

```
percepcion (tu mensaje + contexto del sistema)
  -> interpretacion (pensamiento interno del modelo)
  -> emocion (emocion + intensidad)
  -> memoria (hechos, resumen)
  -> rasgos (deltas acotados)
  -> decision / comportamiento (respuesta + accion opcional)
  -> asimilacion embebida (mismo turno, 1 sola llamada al modelo)
```

### Psique (`psique.js`)

* **18 rasgos:** 6 ancla (`curiosidad`, `amabilidad`, `sentidoDelHumor`, `empatia`, `energia`, `sociabilidad`) + 12 desarrollados (`confianza`, `inseguridad`, `afecto`, `celos`, `posesividad`, `desconfianza`, `resentimiento`, `paciencia`, `sensibilidad`, `agresividadVerbal`, `dependenciaEmocional`, `independencia`). Cada uno guarda `{ base, valor, causas[] }`.
* **Deltas acotados:** `delta = maxDelta * (intensidad/10) * sensibilidad * saturacion * factorEstado * habituacion`. Saturacion frena extremos, `factorEstado` modula (ej. baja confianza amplifica celos), habituacion atenua la repeticion del mismo tipo de evento, `reparacion` acelera la recuperacion de rasgos negativos tras experiencias positivas.
* **Decaimiento:** ~3% por dia hacia la base. La personalidad respira; nada se queda congelado en extremos.
* **Episodios:** `memoria.eventos[]` con `{ id, fecha, tipo, contexto, interpretacion, emociones, deltas, entidad }`.
* **Vinculos emocionales:** `memoria.vinculos[entidad] = { valencia (-1..1), intensidad, episodios[] }`.
* **Patrones:** tras 3 repeticiones de un mismo tipo de episodio, Luna "aprende" un patron legible en `memoria.patrones[]`.
* **Causalidad obligatoria:** todo cambio de rasgo exige un `motivo` que cite algo que dijiste. Sin episodio real no hay delta. La anti-invencion esta reforzada en el prompt y acotada en codigo.

### Acciones y permisos (`control.js`)

| Accion | Impacto | Confirmacion |
|---|---|---|
| `estado_sistema` | informativo | no |
| `abrir_aplicacion` | cambiar_sistema | si |
| `cerrar_aplicacion` | cambiar_sistema | si |

* En **Windows** son acciones reales sobre tu PC (PowerShell), con confirmacion para las de impacto y procesos del sistema protegidos.
* En un **servidor Linux** Luna no puede tocar tu PC: `estado_sistema` reporta el servidor y abrir/cerrar responde con un aviso honesto.

### Modelo (`modelo.js`)

Unica interfaz al LLM: `llamarModelo()` contra Ollama, con `format: json`, `think: false`, streaming NDJSON, reintentos y verificacion al arranque. Los hilos se ajustan solos a los cores del equipo. Cambiar de modelo es editar una linea de `config.json`.

### Servidor (`servidor.js`)

API HTTP (cero dependencias) que expone a Luna. La memoria y la psique viven donde corre el servidor.

| Ruta | Metodo | Que hace |
|---|---|---|
| `/api/estado` | GET | Animo, rasgos con mayor desvio, recuerdos y estado de Ollama |
| `/api/chat` | POST | Conversa con Luna; responde NDJSON en streaming (`token` parciales + `final`) |
| `/api/recuerdos` | GET | Hechos que Luna recuerda de ti |
| `/api/reset` | POST | Olvida todo y vuelve a la psique base |

Clave obligatoria (cabecera `x-luna-clave`, comparacion timing-safe), peticiones encoladas de una en una para que la memoria nunca se corrompa.

### App de escritorio (`app/`)

Electron sin dependencias de runtime: pantalla de inicio (URL del servidor + clave) y chat con streaming, pensamientos, emocion y cambios de rasgos en vivo. El exe portable se descarga en [Releases](https://github.com/motye2011/luna-2.0/releases).

---

## Requisitos

* **Node.js 18+** y **Ollama** (https://ollama.com) con el modelo de `config.json` (`ollama pull qwen3:8b`, ~5.2 GB).
* **16 GB RAM** recomendado para `qwen3:8b`. En CPU: ~3-5 tok/s.
* CLI con acciones de PC: **Windows 10/11**. Servidor y app: **Linux/Windows**.

## Mientras no hay servidor (local, desarrollo)

```powershell
git clone https://github.com/motye2011/luna-2.0.git
cd luna-2.0
ollama pull qwen3:8b

node index.js        # CLI: chat en la terminal
node servidor.js     # API local para probar la app (imprime la clave)
```

Para generar el exe de la app:

```powershell
cd app
npm install
npm run dist         # genera app/dist/Luna.exe (portable)
```

### Comandos de la CLI

| Comando | Que hace |
|---|---|
| `/ayuda` | Lista de comandos |
| `/recuerdos` | Hechos que Luna recuerda de ti |
| `/psique` | Rasgos vs base con causas, vinculos, patrones y episodios |
| `/explica <rasgo>` | Por que tiene tal valor un rasgo (ej. `/explica confianza`) |
| `/buena` `👍` / `/mala` `👎` | Valora la ultima respuesta (va a `registro/evaluado/`) |
| `/valorar 1-5` | Valoracion rapida |
| `/corregir <texto>` | Ensenale como debio responder |
| `/dataset` | Genera el dataset de fine-tuning con lo aprobado |
| `/reset` | Olvida todo |
| `/salir` | Guarda y cierra |

## Cuando haya servidor (Oracle)

Guia completa paso a paso en **[DEPLOY_ORACLE.md](DEPLOY_ORACLE.md)**. Resumen:

```bash
# en el servidor (Ubuntu, instancia gratuita Oracle A1: 4 cores ARM + 24 GB RAM)
git clone https://github.com/motye2011/luna-2.0.git && cd luna-2.0
bash deploy/setup-oracle.sh   # instala Node 20 + Ollama + modelo
tmux new -s api
node servidor.js              # la Luna real vive aqui
```

Despues: abrir el puerto 8787 (Security List + iptables, esta en la guia), y en la app `Luna.exe` poner `http://IP:8787` + la clave impresa por el servidor. Para trafico cifrado, tunel SSH (`ssh -L 8787:localhost:8787 ...`) y `http://localhost:8787` en la app.

Desde ese momento, la memoria vive SOLO en el servidor. Copias de seguridad: `scp` de `memoria.json` (detallado en la guia).

## Configuracion (`config.json`)

```json
{
  "modelo": { "modelo": "qwen3:8b", "baseURL": "http://localhost:11434", "temperature": 1.0, "maxTokens": 700, "numCtx": 4096 },
  "maxHistorial": 12,
  "servidor": { "puerto": 8787 },
  "psique": { "sensibilidad": 1.0, "decaimiento": 0.03, "maxDelta": 6, "umbralCambio": 3 },
  "rasgosIniciales": { "curiosidad": 75, "...": "..." }
}
```

* `temperature 1.0` da espontaneidad; bajalo para respuestas mas estables.
* `maxHistorial 12` = 24 mensajes recientes; lo viejo se compacta a `memoria.resumen`.
* `servidor.puerto`: puerto de la API. La clave se lee de `LUNA_CLAVE`, de `servidor.clave` o se genera sola en `clave-servidor.local`.
* Modelo mas ligero para CPU modesta: `qwen3:4b`.

## Estructura

```
index.js                      # orquestador, prompt, conversar(), comandos CLI
psique.js                     # motor de rasgos, episodios, vinculos, patrones
control.js                    # acciones de PC (Windows) / avisos (servidor)
modelo.js                     # cliente Ollama (unico punto de acceso al LLM)
servidor.js                   # API HTTP con clave para los clientes
config.json                   # personalidad, modelo, psique
memoria.json                  # estado persistente (gitignored, privado)
clave-servidor.local          # clave de la API (generada sola, gitignored)
deploy/setup-oracle.sh        # preparacion automatica del servidor
app/                          # app Electron: login + chat -> Luna.exe
scripts/preparar_dataset.js   # evaluado -> dataset de fine-tuning
registro/                     # bitacoras privadas (gitignored)
DEPLOY_ORACLE.md              # guia de despliegue en servidor
```

## Privacidad

Luna vive en TU maquina o en TU servidor. Sin `openai`, sin `dotenv`, sin claves de terceros. `memoria.json`, `registro/` y `clave-servidor.local` estan en `.gitignore` a proposito: contienen tu vida privada y no se suben a GitHub. La API exige clave en todas las rutas y Ollama nunca sale a internet.

## Fine-tuning

No se entrena `Si X -> responde Y`: se entrenan patrones de comportamiento, con LoRA/QLoRA sobre el modelo base intacto.

```
registro/bruto/conversaciones.jsonl   # todo turno con contexto completo
        |  /buena /mala /corregir
        v
registro/evaluado/aprobado.jsonl      # solo lo que TUI curaste
        |  /dataset
        v
registro/dataset/train.jsonl          # messages para TRL/SFTTrainer
        v
  Qwen3 + LoRA "Luna" -> Ollama
```

Uso diario: valora respuestas (`/buena`, `/mala`, `/corregir`) durante semanas; cuando haya suficiente material curado, `/dataset` genera el train/validation listos para entrenar.

## Rendimiento

Con `qwen3:8b` en CPU espera ~3-5 tok/s: respuestas largas de 1-2 min con streaming letra a letra. Es normal. Tras el primer mensaje, Ollama mantiene el modelo cargado (`keepAlive: 30m`) y todo va mas rapido.

## Licencia

Sin licencia definida por ahora. Uso personal.
