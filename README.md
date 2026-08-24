# Luna 2.0 Testing

Companera virtual con personalidad emergente. 100% local via Ollama, sin APIs externas, sin dependencias.

Luna no es una asistente. Es una persona con memoria, emociones y rasgos que evolucionan segun lo que vive contigo. Cada conversacion deja huella y esa huella es rastreable.

## Enfoque del proyecto

La mayoria de IAs responden con guiones fijos o prompts estaticos. Luna hace lo opuesto:

* **Personalidad emergente, no escrita.** No hay `if celos + 10`. Hay 18 rasgos numericos (0-100) con valor base y valor actual que se desplazan solo por episodios reales. Si te pregunta "por que estas tan desconfiada?" puede citar el hecho concreto que la marco.
* **Causalidad obligatoria.** Todo cambio de rasgo requiere un `motivo` que cite algo que dijiste. Sin episodio real, no hay delta. La anti-invencion esta reforzada en el prompt y acotada en codigo.
* **Memoria como historia vivida.** Hechos del usuario, resumen en primera persona, historial reciente, eventos con deltas y emociones, vinculos por entidad y patrones tras repeticion. La compactacion preserva lo importante cuando el historial crece.
* **Permisos con consentimiento.** Luna puede actuar en tu PC, pero solo lo hace cuando su caracter se lo pide y, para acciones con impacto, te pide confirmacion.
* **Local y privado.** Todo corre en tu maquina. Sin `openai`, sin `dotenv`, sin keys. Preparado para fine-tuning con dataset curado a partir de `registro/`.

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
* Windows 10/11 (acciones usan PowerShell). Tambien corre en servidores Linux (Oracle, VPS): ver [DEPLOY_ORACLE.md](DEPLOY_ORACLE.md).

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
| `/buena` `👍` | Marca la ultima respuesta como buena (va a `evaluado/aprobado.jsonl`) |
| `/mala` `👎` | Marca la ultima respuesta como mala (va a `evaluado/rechazado.jsonl`) |
| `/valorar 1-5` | Valoracion rapida 1-5 (4-5 aprueba, 1-3 rechaza) |
| `/corregir <texto>` | Corrige la ultima respuesta: guarda `respuesta_original` + `respuesta_corregida` como ejemplo aprobado |
| `/dataset` | Genera `registro/dataset/train.jsonl` + `validation.jsonl` a partir de lo aprobado |
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
index.js                      # orquestador, prompt, conversar(), comandos
psique.js                     # motor de rasgos, episodios, vinculos, patrones
control.js                    # acciones reales sobre Windows
modelo.js                     # cliente Ollama (unico punto de acceso al LLM)
config.json                   # personalidad, modelo, psique, rasgos iniciales
memoria.json                  # estado persistente (gitignored, privado)
registro/luna.jsonl           # bitacora legacy (compatibilidad)
registro/bruto/conversaciones.jsonl  # registro enriquecido por turno (privado)
registro/evaluado/aprobado.jsonl     # solo respuestas valoradas como buenas
registro/evaluado/rechazado.jsonl    # respuestas marcadas como malas
registro/dataset/train.jsonl         # dataset final messages para TRL
registro/dataset/validation.jsonl    # split validacion
scripts/preparar_dataset.js   # convierte evaluado -> dataset
```

## Privacidad

Todo es local. `index.js` no importa `openai`, `dotenv` ni lee `.env`. `memoria.json` y `registro/` estan en `.gitignore` a proposito: contienen tu vida privada. No se suben a GitHub. Si clonas el repo en otra maquina, Luna empieza con psique base.

## Fine-tuning

No se entrena `Si X -> responde Y`. Se entrenan patrones de comportamiento.

### Que aprende

* Como habla Luna, cuando ser carinosa/fria, como expresar enojo/celos, como reaccionar ante conflictos, como disculparse, como interpretar situaciones segun su estado, como mantener coherencia de personaje.

### Separacion programa / modelo

```
           LUNA
             |
  +----------+----------+
  |                     |
PROGRAMA              MODELO
Memoria               Lenguaje
Emociones             Expresion
Rasgos                Interpretacion
Percepcion            Comportamiento
Permisos
```

No se mete `Luna sabe que Daniel juega Valorant` en el modelo. Eso es memoria. Se entrena `cuando Luna recibe estado X + recuerdos relevantes Y, sabe como reaccionar`.

### Pipeline

```
registro/bruto/conversaciones.jsonl   # todo turno con contexto completo
        |  /buena /mala /corregir
        v
registro/evaluado/aprobado.jsonl      # solo buenas + corregidas (curado por ti)
        |  /dataset o node scripts/preparar_dataset.js
        v
registro/dataset/train.jsonl          # { messages: [system, user, assistant], tipo, meta }
registro/dataset/validation.jsonl
        |
        v
  Qwen3 8B + LoRA/QLoRA -> Ollama (modelo base intacto, adaptador Luna)
```

### Formato enriquecido (por turno)

```json
{
  "fecha": "2026-08-21T10:30:00",
  "mensajes": [{ "role": "user", "content": "¿Por que estas tan distante?" }],
  "contexto": {
    "percepcion": { "ventanas": "...", "tiempoSinResponder": 7200 },
    "emociones": { "emoción": "tristeza", "intensidad": 6 },
    "rasgos": { "confianza": 45, "inseguridad": 62, "celos": 35 }
  },
  "memoriasRelevantes": ["episodio_21", "episodio_25"],
  "interpretacion": { "significado": "Daniel ha estado distante", "sentido": "negativo" },
  "respuesta": "Ultimamente siento que estas distante...",
  "accion": null,
  "valoracion": { "aprobada": true, "tipo": "buena" }
}
```

Correccion guarda `respuesta_original` + `respuesta_corregida`. Solo lo aprobado entra al dataset. Sin valoracion no hay entrenamiento de basura.

### Uso diario (no entrenar aun)

1. Usa Luna semanas/meses normal.
2. Valora: `/buena` cuando suene a Luna, `/mala` cuando no, `/corregir <texto>` cuando quieras mostrarle como debio responder.
3. Cuando tengas suficientes curados: `/dataset` genera `train.jsonl`/`validation.jsonl` listos para TRL/SFTTrainer. La calidad importa mas que la cantidad.

### Tecnica recomendada

LoRA/QLoRA, no full fine-tuning. Tu PC con RX 7700 XT 12GB + 32GB RAM puede con QLoRA 4-bit para 8B. Mantiene Qwen3 base intacto para comparar `Qwen3` vs `Qwen3 + Luna LoRA`.

### Dataset `messages` para TRL

```json
{ "messages": [
  { "role": "system", "content": "Eres Luna. Estado: confianza=45 (base 70)... Mantén coherencia..." },
  { "role": "user", "content": "¿Que te pasa?" },
  { "role": "assistant", "content": "No se... siento que siempre termino esperando por ti." }
], "tipo": "expresion" }
```

Tipos: `personalidad` / `interpretacion` / `expresion` segun si hubo cambio de rasgos o solo expresion. Compatible con chat template de Qwen.

## Notas de rendimiento

Con `qwen3:8b` en 16 GB single-channel veras `~1-2 min` por respuesta larga y streaming letra a letra. Es normal. Tras el primer mensaje Ollama mantiene el modelo en VRAM/RAM con `keepAlive: 30m`, los siguientes son mas rapidos.

## Licencia

Sin licencia definida por ahora. Uso personal.
