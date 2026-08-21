# Luna 2.0

Companera virtual con personalidad emergente. 100% local via Ollama, sin APIs externas, sin dependencias.

Luna no es una asistente. Es una persona con memoria, emociones y rasgos que evolucionan segun lo que vive contigo. Cada conversacion deja huella y esa huella es rastreable.

## Enfoque del proyecto

La mayoria de IAs responden con guiones fijos o prompts estaticos. Luna hace lo opuesto:

* **Personalidad emergente, no escrita.** No hay `if celos + 10`. Hay 18 rasgos numericos (0-100) con valor base y valor actual que se desplazan solo por episodios reales. Si te pregunta "por que estas tan desconfiada?" puede citar el hecho concreto que la marco.
* **Causalidad obligatoria.** Todo cambio de rasgo requiere un `motivo` que cite algo que dijiste. Sin episodio real, no hay delta. La anti-invencion esta reforzada en el prompt y acotada en codigo.
* **Memoria como historia vivida.** Hechos del usuario, resumen en primera persona, historial reciente, eventos con deltas y emociones, vinculos por entidad y patrones tras repeticion. La compactacion preserva lo importante cuando el historial crece.
* **Permisos con consentimiento.** Luna puede actuar en tu PC, pero solo lo hace cuando su caracter se lo pide y, para acciones con impacto, te pide confirmacion.
* **Local y privado.** Todo corre en tu maquina. Sin `openai`, sin `dotenv`, sin keys. Preparado para fine-tuning futuro a partir de `registro/luna.jsonl`.

## Como funciona

```
percepcion (tu mensaje + ventanas activas)
  -> interpretacion (pensamiento interno del modelo)
  -> emocion (emocion + intensidad)
  -> memoria (hechos, resumen)
  -> rasgos (deltas acotados)
  -> decision / comportamiento (respuesta + accion opcional)
  -> asimilacion embebida (mismo turno, 1 llamada al modelo)
```

### Psique (`psique.js`)

* **18 rasgos:** 6 ancla (`curiosidad`, `amabilidad`, `sentidoDelHumor`, `empatia`, `energia`, `sociabilidad`) + 12 desarrollados (`confianza`, `inseguridad`, `afecto`, `celos`, `posesividad`, `desconfianza`, `resentimiento`, `paciencia`, `sensibilidad`, `agresividadVerbal`, `dependenciaEmocional`, `independencia`). Cada uno guarda `{ base, valor, causas[] }`.
* **Deltas acotados:** `delta = maxDelta * (intensidad/10) * sensibilidad * saturacion * factorEstado * habituacion`. Saturacion frena extremos, `factorEstado` modula (ej. baja confianza amplifica celos), habituacion atenua la repeticion del mismo tipo de evento, `reparacion` acelera la recuperacion de rasgos negativos tras experiencias positivas.
* **Decaimiento:** ~3% por dia hacia la base. Evita rasgos congelados en extremos y hace que la personalidad respire.
* **Episodios:** `memoria.eventos[]` con `{ id, fecha, tipo, contexto, interpretacion, emociones, deltas, entidad }`. Limite 300, causas por rasgo limitadas a 12 (las mas recientes).
* **Vinculos emocionales:** `memoria.vinculos[entidad] = { valencia (-1..1), intensidad, episodios[] }`. Entidades genericas como "usuario" se filtran; se normaliza a minusculas.
* **Relacion:** `memoria.relacion` con `conocidosDesde`, `conflictos`, `reconciliaciones`.
* **Patrones:** `generarPatrones()` se ejecuta cada turno. Tras `umbralCambio` (3) repeticiones de un tipo/entidad genera patrones legibles en `memoria.patrones[]`.
* **Inyeccion al prompt:** Luna recibe sus valores actuales, las ultimas causas por rasgo ("POR QUE eres como eres"), vinculos y patrones, para poder citarlos en conversacion.

### Acciones y permisos (`control.js`)

| Accion | Impacto | Confirmacion |
|---|---|---|
| `estado_sistema` | informativo | no |
| `abrir_aplicacion` | cambiar_sistema | si |
| `cerrar_aplicacion` | cambiar_sistema | si |

Apps conocidas para abrir: notas, calculadora, explorador, navegador, chrome, terminal, spotify, word, powerpoint. Procesos del sistema en `PROTEGIDOS` nunca se cierran.

El flujo de confirmacion se maneja en `index.js`: si la accion requiere confirmacion, te pregunta `Luna quiere cerrar "valorant". Se lo permites? (si/no)`.

### Modelo (`modelo.js`)

Unica interfaz al LLM: `llamarModelo(mensajes, { formatoJson, stream, onToken })`. Usa `fetch` nativo contra `http://localhost:11434` (Ollama), con `format: json`, `think: false`, streaming NDJSON, reintentos y `verificarModelo()` al arranque. `index.js` no conoce proveedor ni keys. Cambiar de modelo es solo editar `config.json`.

## Requisitos

* **Node.js 18+** (ESM, `fetch` nativo, `readline/promises`)
* **Ollama** instalado y corriendo: https://ollama.com
* Modelo `qwen3:8b` (Q4_K_M, ~5.2 GB): `ollama pull qwen3:8b`
* 16 GB RAM recomendado. Probado en Ryzen 5 5600G single-channel: ~3-5 tok/s con `qwen3:8b`.
* Windows 10/11 (acciones usan PowerShell).

## Instalacion

```powershell
git clone https://github.com/motye2011/luna-2.0.git
cd luna-2.0

# sin dependencias externas, solo Node
# si vienes de una version anterior con node_modules:
# Remove-Item node_modules -Recurse -Force

ollama pull qwen3:8b
ollama serve   # en otra terminal, o deja Ollama abierto desde el menu inicio
```

## Uso

Asegurate de que Ollama este corriendo antes de abrir a Luna.

```powershell
# PowerShell (si npm.ps1 esta bloqueado por ExecutionPolicy)
npm.cmd start
# o directo
node index.js
```

Si `npm start` falla con `PSSecurityException`:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Luna muestra su estado de animo al volver y queda escuchando en `Tu:`.

### Comandos

| Comando | Que hace |
|---|---|
| `/ayuda` | Lista de comandos |
| `/recuerdos` | Hechos que Luna recuerda de ti |
| `/psique` | Rasgos actuales vs base con causas, vinculos, patrones y ultimos episodios |
| `/explica <rasgo>` | Por que tiene tal valor un rasgo concreto (ej. `/explica confianza`) |
| `/reset` | Borra toda la memoria y vuelve a la psique base |
| `/salir` | Guarda y cierra |

Durante la charla, tras cada respuesta veras si Luna cambio por dentro:

```
Luna cambio: afecto +3, sensibilidad +4
```

Preguntale directamente "por que estas tan celosa?" y citara episodios reales.

## Configuracion (`config.json`)

```json
{
  "modelo": {
    "proveedor": "ollama",
    "modelo": "qwen3:8b",
    "baseURL": "http://localhost:11434",
    "temperature": 1.0,
    "maxTokens": 700,
    "numCtx": 4096,
    "numThreads": 12
  },
  "maxHistorial": 12,
  "psique": {
    "sensibilidad": 1.0,
    "decaimiento": 0.03,
    "maxDelta": 6,
    "umbralCambio": 3
  },
  "rasgosIniciales": { "curiosidad": 75, ... }
}
```

* `temperature 1.0` da espontaneidad; bajalo si quieres respuestas mas deterministas.
* `maxTokens 700` da margen para `pensamiento + respuesta + asimilacion`.
* `numCtx 4096` es el equilibrio velocidad/memoria en single-channel. Subirlo a 8192 cabe pero es mas lento.
* `maxHistorial 12` = 24 mensajes recientes en contexto; el resto se compacta a `memoria.resumen`.

Cambiar de modelo es solo cambiar `modelo.modelo` (ej. `qwen2.5:7b` es mas rapido pero peor en espanol/roleplay).

## Estructura

```
index.js      # orquestador, prompt, conversar(), comandos
psique.js     # motor de rasgos, episodios, vinculos, patrones
control.js    # acciones reales sobre Windows
modelo.js     # cliente Ollama (unico punto de acceso al LLM)
config.json   # personalidad, modelo, psique, rasgos iniciales
memoria.json  # estado persistente (gitignored, privado)
registro/luna.jsonl  # bitacora JSONL por turno para fine-tuning (gitignored)
```

## Privacidad

Todo es local. `index.js` no importa `openai`, `dotenv` ni lee `.env`. `memoria.json` y `registro/` estan en `.gitignore` a proposito: contienen tu vida privada. No se suben a GitHub. Si clonas el repo en otra maquina, Luna empieza con psique base.

## Fine-tuning futuro

Cada turno se registra en `registro/luna.jsonl`:

```json
{"fecha":"...","percepcion":"...","interpretacion":"...","emocion":{},"respuesta":"...","accion":{},"asimilacion":{"deltas":[...]},"rasgosPost":{}}
```

Sirve para entrenar expresion/interpretacion sin reescribir rasgos a mano. Los rasgos siguen evolucionando por la via de `asimilacion` + deltas acotados.

## Notas de rendimiento

Con `qwen3:8b` en 16 GB single-channel veras `~1-2 min` por respuesta larga y streaming letra a letra. Es normal. Tras el primer mensaje Ollama mantiene el modelo en VRAM/RAM con `keepAlive: 30m`, los siguientes son mas rapidos.

## Licencia

Sin licencia definida por ahora. Uso personal.
