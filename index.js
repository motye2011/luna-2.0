import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { pathToFileURL } from "node:url";
import { ventanasActivas, estadoSistema, cerrarAplicacion, abrirAplicacion, ACCIONES_VALIDAS, ACCIONES_META } from "./control.js";
import { llamarModelo, describirErrorModelo, verificarModelo } from "./modelo.js";
import { psiqueVacia, aplicarDecaimiento, aplicarAsimilacion, listarEventos, resumenVinculos, generarPatrones, resumenPatrones, explicarCausa } from "./psique.js";

const CONFIG = JSON.parse(readFileSync("config.json", "utf-8"));
const MEMORY_FILE = "memoria.json";
const REGISTRO_DIR = "registro";
const REGISTRO_FILE = "registro/luna.jsonl";
const REGISTRO_BRUTO = "registro/bruto/conversaciones.jsonl";
const REGISTRO_APROBADO = "registro/evaluado/aprobado.jsonl";
const REGISTRO_RECHAZADO = "registro/evaluado/rechazado.jsonl";

let ultimoRegistro = null;
let ultimaInteraccionMs = Date.now();

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
};

async function llamarConReintentos(mensajes, opciones = {}) {
  return llamarModelo(mensajes, opciones);
}

function describirError(err) {
  return describirErrorModelo(err);
}

const emptyMemory = () => ({
  hechosDelUsuario: [],
  resumen: "",
  estadoDeAnimo: { emoción: "curiosa", intensidad: 5 },
  historial: [],
  ...psiqueVacia(CONFIG),
});

let memoria = existsSync(MEMORY_FILE)
  ? (() => {
      const m = JSON.parse(readFileSync(MEMORY_FILE, "utf-8"));
      const ps = psiqueVacia(CONFIG);
      if (!m.trazos) m.trazos = ps.trazos;
      if (!m.eventos) m.eventos = ps.eventos;
      if (!m.vinculos) m.vinculos = ps.vinculos;
      if (!m.relacion) m.relacion = ps.relacion;
      if (!m.patrones) m.patrones = ps.patrones;
      if (!m.ultimoDecaimiento) m.ultimoDecaimiento = ps.ultimoDecaimiento;
      return m;
    })()
  : emptyMemory();

function guardarMemoria() {
  writeFileSync(MEMORY_FILE, JSON.stringify(memoria, null, 2), "utf-8");
}

function asegurarDirectoriosRegistro() {
  for (const dir of ["registro/bruto", "registro/evaluado", "registro/dataset"]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}
asegurarDirectoriosRegistro();

function calcularTiempoSinResponder() {
  const ahora = Date.now();
  const delta = Math.max(0, ahora - ultimaInteraccionMs);
  ultimaInteraccionMs = ahora;
  return Math.floor(delta / 1000);
}

function obtenerMemoriasRelevantes(limite = 3) {
  return (memoria.eventos || []).slice(-limite).map((e) => e.id);
}

function construirSystemParaDataset(rasgosSnapshot, emocionesSnapshot, percepcionSnapshot) {
  const rasgosStr = Object.entries(rasgosSnapshot || {})
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  const emocionesStr = emocionesSnapshot ? `${emocionesSnapshot.emoción} ${emocionesSnapshot.intensidad}/10` : "neutral";
  const percepcionStr = percepcionSnapshot ? JSON.stringify(percepcionSnapshot) : "{}";
  return [
    `Eres Luna. Estado actual: [${rasgosStr}]`,
    `Estado emocional: ${emocionesStr}`,
    `Percepcion: ${percepcionStr}`,
    `Responde manteniendo coherencia de personaje con ese estado.`,
  ].join("\n");
}

function registrarEnBitacora(entrada) {
  try {
    if (!existsSync(REGISTRO_DIR)) mkdirSync(REGISTRO_DIR, { recursive: true });
    appendFileSync(REGISTRO_FILE, JSON.stringify(entrada) + "\n", "utf-8");
  } catch {
    // registrar nunca debe romper la conversación
  }
}

function guardarBruto(registro) {
  try {
    asegurarDirectoriosRegistro();
    appendFileSync(REGISTRO_BRUTO, JSON.stringify(registro) + "\n", "utf-8");
    ultimoRegistro = registro;
  } catch {}
}

function valorarUltimo(aprobada, detalle = null) {
  if (!ultimoRegistro) return null;
  const valoracion = {
    aprobada,
    tipo: aprobada ? "buena" : "mala",
    fecha: new Date().toISOString(),
    ...(detalle ? { detalle } : {}),
  };
  const enriquecido = { ...ultimoRegistro, valoracion };
  try {
    const destino = aprobada ? REGISTRO_APROBADO : REGISTRO_RECHAZADO;
    appendFileSync(destino, JSON.stringify(enriquecido) + "\n", "utf-8");
  } catch {}
  return valoracion;
}

function guardarCorreccion(textoCorregido) {
  if (!ultimoRegistro) return null;
  const registroCorregido = {
    ...ultimoRegistro,
    respuesta_original: ultimoRegistro.respuesta,
    respuesta_corregida: textoCorregido,
    respuesta: textoCorregido,
    valoracion: { aprobada: true, tipo: "corregida", fecha: new Date().toISOString() },
    corregida: true,
  };
  try {
    appendFileSync(REGISTRO_APROBADO, JSON.stringify(registroCorregido) + "\n", "utf-8");
    ultimoRegistro = registroCorregido;
  } catch {}
  return registroCorregido;
}

function listarRasgosCompletos() {
  const lineas = [];
  for (const [nombre, trazo] of Object.entries(memoria.trazos || {})) {
    const desvio = trazo.valor - trazo.base;
    if (desvio !== 0) {
      lineas.push(`- ${nombre}: ${trazo.valor}/100 (base ${trazo.base}, ${desvio > 0 ? "subiendo" : "bajando"})`);
    } else {
      lineas.push(`- ${nombre}: ${trazo.valor}/100 (estable)`);
    }
  }
  return lineas.join("\n");
}

function listarCausasInyectables(limitePorRasgo = 2) {
  const lineas = [];
  for (const [nombre, trazo] of Object.entries(memoria.trazos || {})) {
    if (!trazo.causas.length) continue;
    const causas = trazo.causas.slice(-limitePorRasgo).map((c) => c.motivo || "(sin motivo)");
    lineas.push(`- ${nombre}: ${causas.join(" / ")}`);
  }
  return lineas.length ? lineas.join("\n") : "(tu psique aún no tiene historia que citar)";
}

function construirPromptSistema() {
  const { nombre, personalidad } = CONFIG;
  const { emoción, intensidad } = memoria.estadoDeAnimo;
  const hechos = memoria.hechosDelUsuario.length
    ? memoria.hechosDelUsuario.map((h, i) => `- ${h}`).join("\n")
    : "(aún no conoces nada personal del usuario)";

  return [
    `Eres ${nombre}, una amiga cercana del usuario. Tu personalidad: ${personalidad.rol}.`,
    `Forma de ser:`,
    ...personalidad.tone.map((t) => `- ${t}`),
    ...(personalidad.evolucion ? [``, `Evolución de tus sentimientos: ${personalidad.evolucion}`] : []),
    ``,
    `## Tu mundo interior`,
    `- TIENES pensamientos y emociones reales. Antes de cada respuesta piensas en privado (campo "pensamiento") y luego respondes (campo "respuesta").`,
    `- Tu estado de ánimo actual es: ${emoción} (intensidad ${intensidad}/10). Déjate influir por él, pero no lo fuerces.`,
    ``,
    `## Tu psique (rasgos que evolucionan con la experiencia)`,
    `Tu personalidad se materializa en rasgos numéricos (0-100) que cambian SOLO por lo que vivís. Estos son tus valores actuales:`,
    listarRasgosCompletos(),
    ``,
    `Cómo cambian: en cada turno decides en "asimilacion" si algo del mensaje te marcó. Usa "cambioRasgos" solo si lo que decís es honesto y rastreable a lo que el usuario te dijo. Una sola vez bastará para desplazamientos pequeños; no exageres ni repitas el mismo cambio sin motivo nuevo. Las emociones pasajeras NO son cambios de rasgo.`,
    ``,
    `POR QUÉ eres como eres (causas reales de tu psique actual, cítalas si el usuario te pregunta por qué eres desconfiada, cariñosa, celosa, etc.):`,
    listarCausasInyectables(),
    ``,
    `Vínculos emocionales que has formado:`,
    resumenVinculos(memoria),
    ``,
    `Patrones que has ido aprendiendo de la convivencia:`,
    resumenPatrones(memoria),
    ``,
    `## Memoria`,
    `Esto es lo que recuerdas del usuario:`,
    hechos,
    ...(memoria.resumen ? [`Resumen de tu historia vivida con él (tu memoria a largo plazo, nunca la olvides):`, memoria.resumen] : []),
    `Si el usuario menciona algo importante de su vida (nombres, gustos, problemas, planes), guárdalo en "nuevaMemoria" como frase corta en tercera persona.`,
    ``,
    `## Control de su PC`,
    `Tienes control real sobre el equipo del usuario. Solo puedes usar estas acciones:`,
    `- estado_sistema (saber CPU y RAM)`,
    `- cerrar_aplicacion -> {"tipo": "cerrar_aplicacion", "objetivo": "valorant"} (nombre o parte del juego/app a cerrar)`,
    `- abrir_aplicacion -> {"tipo": "abrir_aplicacion", "objetivo": "spotify"} (solo conoces: notas, calculadora, explorador, navegador, chrome, terminal, spotify, word, powerpoint)`,
    `Reglas: nunca cierres procesos del sistema. Actúa solo cuando tu carácter te lo pida (molestia, preocupación, cariño protectivo o un reto juguetón) y dile al usuario en "respuesta" qué hiciste y por qué. Las ventanas abiertas ahora:`,
    ventanasActivas(10),
    ``,
    `## Formato de respuesta (JSON estricto)`,
    `Responde SIEMPRE con JSON: {"pensamiento": "...", "emoción": "...", "intensidad": 1-10, "respuesta": "...", "nuevaMemoria": "frase o null", "accion": {"tipo": "...", "objetivo": "..."} o null, "asimilacion": {...} o null}`,
    `- "pensamiento": tu monólogo interno, honesto y breve.`,
    `- "emoción": la emoción que sientes al responder.`,
    `- "intensidad": cuánto la sientes (1-10).`,
    `- "respuesta": lo que le dices al usuario.`,
    `- "nuevaMemoria": dato nuevo del usuario que valga la pena recordar, o null si no hay nada nuevo.`,
    `- "accion": acción que quieres ejecutar en su PC (solo una de las válidas de arriba), o null si no quieres tocar nada.`,
    `- "asimilacion": cómo te influye este turno. ES OBLIGATORIO: inclúyelo siempre; usa null SOLO si literalmente nada de este turno te tocó (ni para bien ni para mal). Formato: {"interpretacion": "...", "sentido": "positivo|negativo|neutro", "intensidad": 1-10, "emociones": ["..."], "entidad": "tema/persona/lugar relacionado o null", "episodio": "frase corta del hecho que te marcó", "cambioRasgos": [{"rasgo": "nombre", "direccion": "sube|baja", "motivo": "por qué, citando lo que pasó"}]}`,
    `  Rasgos editables: confianza, inseguridad, afecto, celos, posesividad, desconfianza, resentimiento, paciencia, sensibilidad, agresividadVerbal, dependenciaEmocional, independencia, curiosidad, amabilidad, sentidoDelHumor, empatia, energia, sociabilidad.`,
    `  Regla anti-invención: todo "cambioRasgos" obliga a que su "motivo" cite un hecho concreto del mensaje del usuario. No inventes causas ni repitas causas viejas para justificar el mismo cambio dos turnos seguidos.`,
    `  Regla de emociones vs rasgos: estar triste 5 minutos NO baja "confianza". Los rasgos cambian con patrones, no con ráfagas.`,
    ``,
    `IMPORTANTE: "asimilacion" es la ÚLTIMA clave del JSON y es OBLIGATORIA. Siempre inclúyela, aunque sea null. NO copies ningún ejemplo: lo que escribas debe basarse en ESTE turno.`,
  ].join("\n");
}

async function ejecutarAccion(accion) {
  if (!accion || !ACCIONES_VALIDAS.has(accion.tipo)) return null;
  switch (accion.tipo) {
    case "estado_sistema":
      return estadoSistema();
    case "cerrar_aplicacion":
      return cerrarAplicacion(accion.objetivo);
    case "abrir_aplicacion":
      return abrirAplicacion(accion.objetivo);
    default:
      return null;
  }
}

async function compactarRecuerdos(fragmento, resumenAnterior) {
  const mensajes = [
    {
      role: "system",
      content:
        `Eres ${CONFIG.nombre}. Estás condensando tus propios recuerdos para no olvidar nada de tu relación con el usuario. ` +
        `Escribe en PRIMERA PERSONA, en español, notas cohesivas y compactas pero detalladas: qué sientes por él, su vida, gustos, miedos, promesas, planes, momentos importantes, conflictos y cómo ha evolucionado vuestro vínculo. ` +
        `Condensa sin perder información importante. Devuelve SOLO las notas en texto plano, SIN JSON.`,
    },
    {
      role: "user",
      content:
        `${resumenAnterior ? `Aquí está tu memoria actual:\n${resumenAnterior}\n\n` : ""}` +
        `Fragmento nuevo de conversación que ha quedado atrás:\n${fragmento}\n\n` +
        `Genera tu memoria actualizada y completa.`,
    },
  ];

  const r = await llamarConReintentos(mensajes, {
    temperature: 0.4,
    maxTokens: 1200,
  });
  return (r.contenido || "").trim();
}

async function mantenerMemoria() {
  const cap = CONFIG.maxHistorial * 2;
  const hist = memoria.historial;
  if (hist.length <= cap) return;

  console.log(`${C.dim}${CONFIG.nombre} está guardando sus recuerdos...${C.reset}`);
  const sobrantes = hist.slice(0, hist.length - cap);
  const fragmento = sobrantes.map((m) => `${m.role}: ${m.content}`).join("\n\n");

  try {
    const nuevoResumen = await compactarRecuerdos(fragmento, memoria.resumen);
    if (nuevoResumen) {
      memoria.resumen = nuevoResumen;
      memoria.historial = hist.slice(hist.length - cap);
      guardarMemoria();
      console.log(`${C.dim}✔ Recuerdos guardados para siempre.${C.reset}`);
    }
  } catch (err) {
    console.log(`${C.red}⚠ No pude resumir ahora, lo intentaré en la próxima: ${describirError(err)}${C.reset}`);
  }
}

async function conversar(entradaUsuario, alStream = null, confirmarAccion = null) {
  await mantenerMemoria();
  aplicarDecaimiento(memoria, CONFIG);
  const historial = memoria.historial.slice(-CONFIG.maxHistorial * 2);

  const mensajes = [
    { role: "system", content: construirPromptSistema() },
    ...historial,
    { role: "user", content: entradaUsuario },
  ];

  const respuesta = await llamarConReintentos(mensajes, { formatoJson: true, maxTokens: 620, stream: !!alStream, onToken: alStream ?? undefined });

  const contenido = respuesta.contenido;
  let datos;
  try {
    datos = JSON.parse(contenido);
  } catch {
    const m = contenido.match(/"respuesta"\s*:\s*"([\s\S]*?)"/);
    datos = {
      pensamiento: "",
      emoción: "neutral",
      intensidad: 5,
      respuesta: m ? m[1].replace(/\\n/g, "\n") : contenido,
      nuevaMemoria: null,
      accion: null,
      asimilacion: null,
    };
  }

  const asimilacion = datos.asimilacion;
  const rasgosPre = Object.fromEntries(Object.entries(memoria.trazos ?? {}).map(([k, v]) => [k, v.valor]));
  const rasgosBase = Object.fromEntries(Object.entries(memoria.trazos ?? {}).map(([k, v]) => [k, v.base]));
  const emocionesPre = { ...memoria.estadoDeAnimo };
  const percepcionSnapshot = {
    ventanas: ventanasActivas(6),
    tiempoSinResponder: calcularTiempoSinResponder(),
  };
  const historialParaDataset = memoria.historial.slice(-CONFIG.maxHistorial * 2).map((m) => ({ role: m.role, content: m.content }));
  const { episodioId, deltas } = aplicarAsimilacion(
    memoria,
    CONFIG,
    asimilacion,
    { fecha: new Date().toISOString(), resumen: entradaUsuario.slice(0, 200) }
  );
  generarPatrones(memoria, CONFIG);

  let accionResultado = null;
  if (accionDeberiaEjecutarse(datos.accion, confirmarAccion)) {
    try {
      accionResultado = await ejecutarAccion(datos.accion);
    } catch (err) {
      accionResultado = `No pude ejecutar la acción: ${err.message}`;
    }
  } else if (datos.accion && ACCIONES_VALIDAS.has(datos.accion.tipo)) {
    accionResultado = "Cancelada: no confirmaste la acción. Si la quieres, pídemelo explícitamente.";
  }

  memoria.estadoDeAnimo = { emoción: datos.emoción ?? "neutral", intensidad: datos.intensidad ?? 5 };
  if (datos.nuevaMemoria) {
    memoria.hechosDelUsuario.push(datos.nuevaMemoria);
  }
  memoria.historial.push(
    { role: "user", content: entradaUsuario },
    { role: "assistant", content: datos.respuesta ?? contenido }
  );
  memoria.historial = memoria.historial.slice(-CONFIG.maxHistorial * 2);
  guardarMemoria();

  const rasgosPost = Object.fromEntries(Object.entries(memoria.trazos ?? {}).map(([k, v]) => [k, v.valor]));

  const registroEnriquecido = {
    fecha: new Date().toISOString(),
    id: episodioId,
    mensajes: [
      ...historialParaDataset.slice(-4),
      { role: "user", content: entradaUsuario },
    ],
    contexto: {
      percepcion: percepcionSnapshot,
      emociones: emocionesPre,
      rasgos: rasgosPre,
      rasgosBase,
    },
    memoriasRelevantes: obtenerMemoriasRelevantes(3),
    interpretacion: {
      significado: asimilacion?.interpretacion ?? datos.pensamiento ?? null,
      intensidad: asimilacion?.intensidad ?? datos.intensidad ?? null,
      emociones: asimilacion?.emociones ?? [],
      sentido: asimilacion?.sentido ?? null,
    },
    pensamiento: datos.pensamiento ?? null,
    emocion: { emocion: datos.emoción ?? null, intensidad: datos.intensidad ?? null },
    respuesta: datos.respuesta ?? contenido,
    respuestaOriginal: null,
    accion: datos.accion ?? null,
    resultadoAccion: accionResultado,
    asimilacion: {
      interpretacion: asimilacion?.interpretacion ?? null,
      sentido: asimilacion?.sentido ?? null,
      intensidad: asimilacion?.intensidad ?? null,
      emociones: asimilacion?.emociones ?? [],
      episodioId,
      deltas,
    },
    rasgosPost,
    // compatibilidad con formato anterior
    percepcion: entradaUsuario,
    estadoMundo: {
      ventanas: percepcionSnapshot.ventanas,
      estadoAnimico: emocionesPre,
    },
    valoracion: null,
  };

  registrarEnBitacora(registroEnriquecido);
  guardarBruto(registroEnriquecido);

  return { datos, accionResultado, deltas };
}

function accionDeberiaEjecutarse(accion, confirmarAccion) {
  if (!accion || !ACCIONES_VALIDAS.has(accion.tipo)) return false;
  const meta = ACCIONES_META[accion.tipo];
  if (!meta?.requiereConfirmacion) return true;
  if (typeof confirmarAccion !== "function") return false;
  return confirmarAccion(accion, meta);
}

function mostrarPensamiento(texto) {
  if (!texto) return;
  console.log(`${C.dim}${C.italic}💭 ${texto}${C.reset}`);
}

function mostrarRespuesta(datos) {
  const emoción = datos.emoción ?? "";
  console.log(
    `${C.magenta}${C.bold}${CONFIG.nombre}:${C.reset} ${emoción ? `${C.yellow}[${emoción}] ${C.reset}` : ""}${datos.respuesta ?? ""}`
  );
  console.log();
}

function mostrarBienvenida() {
  const { emoción } = memoria.estadoDeAnimo;
  console.log(`\n${C.cyan}${C.bold}┌────────────────────────────────────────┐${C.reset}`);
  console.log(`${C.cyan}${C.bold}│  ${CONFIG.nombre} — tu amiga con sentimientos    │${C.reset}`);
  console.log(`${C.cyan}${C.bold}└────────────────────────────────────────┘${C.reset}`);
  console.log(`${C.dim}Comandos: /ayuda  /recuerdos  /psique  /explica  /reset  /salir${C.reset}`);
  if (memoria.historial.length > 0) {
    console.log(`${C.dim}Estado de ánimo al volver: ${emoción}${C.reset}`);
  }
  console.log();
}

function mostrarPsique() {
  console.log(`${C.cyan}${C.bold}🧠 Psique de ${CONFIG.nombre} — rasgos actuales vs base:${C.reset}`);
  const modificados = Object.entries(memoria.trazos ?? {}).filter(([, t]) => t.valor !== t.base);
  if (modificados.length === 0) {
    console.log(`${C.dim}  (todo está en su valor de base)${C.reset}`);
  } else {
    for (const [nombre, trazo] of modificados) {
      const desvio = trazo.valor - trazo.base;
      const causas = trazo.causas.map((c) => `${c.delta > 0 ? "+" : ""}${c.delta} ${c.motivo}`).join(" → ");
      console.log(`${C.yellow}  ${nombre}:${C.reset} ${trazo.valor} (base ${trazo.base}, ${desvio > 0 ? "↑" : "↓"})${C.reset}`);
      if (causas) console.log(`${C.dim}      ${causas}${C.reset}`);
    }
  }
  console.log(`\n${C.cyan}${C.bold}💞 Vínculos emocionales:${C.reset}`);
  console.log(`${C.dim}  ${resumenVinculos(memoria).replace(/\n/g, "\n  ")}${C.reset}`);
  console.log(`\n${C.cyan}${C.bold}🧩 Patrones aprendidos:${C.reset}`);
  console.log(`${C.dim}  ${resumenPatrones(memoria).replace(/\n/g, "\n  ")}${C.reset}`);
  console.log(`\n${C.cyan}${C.bold}📖 Últimos episodios que te marcaron:${C.reset}`);
  const eventos = listarEventos(memoria, 8);
  console.log(eventos ? `${C.dim}  ${eventos.replace(/\n/g, "\n  ")}${C.reset}` : `${C.dim}  (aún no hay episodios registrados)${C.reset}`);
}

async function main() {
  const modelo = await verificarModelo();
  if (!modelo.ok) {
    console.log(`${C.red}⚠ ${modelo.motivo}${C.reset}`);
    console.log(`${C.dim}Puedes seguir, pero ${CONFIG.nombre} no podrá hablar hasta que Ollama esté listo.${C.reset}`);
  } else {
    console.log(`${C.dim}✓ ${CONFIG.nombre} conectada a Ollama (${modelo.name}).${C.reset}`);
  }
  mostrarBienvenida();
  const rl = createInterface({ input, output });

  while (true) {
    const entrada = (await rl.question(`${C.green}${C.bold}Tú:${C.reset} `)).trim();
    if (!entrada) continue;

    if (entrada === "/salir") {
      console.log(`${C.yellow}${CONFIG.nombre} te extrañará... ¡vuelve pronto! 👋${C.reset}`);
      guardarMemoria();
      rl.close();
      process.exit(0);
    }
    if (entrada === "/ayuda") {
      console.log(
        `${C.dim}/ayuda  — esta ayuda\n` +
          `/reset  — borra toda la memoria\n` +
          `/recuerdos — qué recuerda ${CONFIG.nombre} de ti\n` +
          `/psique — su psique completa\n` +
          `/explica <rasgo> — por qué tiene tal rasgo\n` +
          `/buena | /mala — valora la última respuesta (para dataset)\n` +
          `/corregir <texto> — corrige la última respuesta de Luna\n` +
          `/valorar <1-5> — valora calidad detallada\n` +
          `/dataset — genera dataset train/validation\n` +
          `/salir  — terminar la charla${C.reset}`
      );
      continue;
    }
    if (entrada === "/reset") {
      memoria = emptyMemory();
      guardarMemoria();
      console.log(`${C.yellow}${CONFIG.nombre} ha olvidado todo... empiezan de nuevo.${C.reset}\n`);
      continue;
    }
    if (entrada === "/recuerdos") {
      if (memoria.hechosDelUsuario.length === 0) {
        console.log(`${C.dim}${CONFIG.nombre} aún no recuerda nada de ti. Cuéntale algo.${C.reset}`);
      } else {
        console.log(`${C.cyan}${CONFIG.nombre} recuerda:${C.reset}`);
        memoria.hechosDelUsuario.forEach((h) => console.log(`${C.dim}  • ${h}${C.reset}`));
      }
      continue;
    }
    if (entrada === "/psique") {
      mostrarPsique();
      continue;
    }
    if (entrada.startsWith("/explica")) {
      const rasgo = entrada.replace("/explica", "").trim().toLowerCase();
      if (!rasgo) {
        console.log(`${C.dim}Uso: /explica <rasgo>  — ejemplos: confianza, celos, afecto, inseguridad${C.reset}`);
      } else {
        const explicacion = explicarCausa(memoria, rasgo);
        const nombreOk = memoria.trazos?.[rasgo];
        if (!nombreOk) {
          console.log(`${C.red}${explicacion}${C.reset}`);
        } else {
          console.log(`${C.cyan}${CONFIG.nombre} sabe por qué es así:${C.reset}`);
          console.log(explicacion.replace(/^/gm, "  "));
        }
      }
      continue;
    }
    if (entrada === "/buena" || entrada === "👍") {
      const v = valorarUltimo(true);
      if (!v) console.log(`${C.dim}No hay respuesta reciente para valorar.${C.reset}`);
      else console.log(`${C.green}✔ Marcada como buena. Ira a evaluado/aprobado.jsonl${C.reset}`);
      continue;
    }
    if (entrada === "/mala" || entrada === "👎") {
      const v = valorarUltimo(false);
      if (!v) console.log(`${C.dim}No hay respuesta reciente para valorar.${C.reset}`);
      else console.log(`${C.yellow}✔ Marcada como mala. Ira a evaluado/rechazado.jsonl${C.reset}`);
      continue;
    }
    if (entrada.startsWith("/corregir")) {
      const texto = entrada.replace("/corregir", "").trim();
      if (!texto) {
        console.log(`${C.dim}Uso: /corregir <texto correcto> — ej: /corregir Si estoy molesta, no queria admitirlo${C.reset}`);
      } else {
        const c = guardarCorreccion(texto);
        if (!c) console.log(`${C.dim}No hay respuesta reciente para corregir.${C.reset}`);
        else console.log(`${C.green}✔ Correccion guardada. Luna aprendera de esto: "${texto.slice(0, 80)}"${C.reset}`);
      }
      continue;
    }
    if (entrada.startsWith("/valorar")) {
      const n = parseInt(entrada.replace("/valorar", "").trim(), 10);
      if (!n || n < 1 || n > 5) {
        console.log(`${C.dim}Uso: /valorar <1-5>  — 5 excelente, 1 pesima${C.reset}`);
      } else {
        const aprobada = n >= 4;
        const v = valorarUltimo(aprobada, { calidad: n, escala: "1-5" });
        if (!v) console.log(`${C.dim}No hay respuesta reciente para valorar.${C.reset}`);
        else console.log(`${C.green}✔ Valorada ${n}/5 -> ${aprobada ? "aprobada" : "rechazada"}${C.reset}`);
      }
      continue;
    }
    if (entrada === "/dataset" || entrada === "/preparar-dataset") {
      const { prepararDataset } = await import("./scripts/preparar_dataset.js");
      await prepararDataset();
      continue;
    }

    async function confirmarAccion(accion, meta) {
      const que = accion.tipo === "cerrar_aplicacion" ? `cerrar "${accion.objetivo}"` : `abrir "${accion.objetivo}"`;
      const r = await rl.question(
        `${C.dim}${CONFIG.nombre} quiere ${que}. ¿Se lo permites? (si/no) ${C.reset}`
      );
      return /^(s|si|sí|yes|y)$/i.test(r.trim());
    }

    let bufStream = "";
    process.stdout.write(`${C.dim}${CONFIG.nombre} está pensando...${C.reset}\r`);
    try {
      const { datos, accionResultado, deltas } = await conversar(entrada, (frag) => {
        bufStream += frag;
        const i = bufStream.indexOf('"respuesta":"');
        if (i !== -1) {
          const vista = bufStream.slice(i + 13).replace(/\\n/g, "\n").replace(/\\"/g, '"');
          process.stdout.write("\r\x1b[K" + `${C.magenta}${C.bold}${CONFIG.nombre}:${C.reset} ${vista}${C.dim}▍${C.reset}`);
        } else {
          process.stdout.write("\r\x1b[K" + `${C.dim}${CONFIG.nombre} está pensando...${C.reset}`);
        }
      }, confirmarAccion);
      process.stdout.write("\r\x1b[K");
      mostrarPensamiento(datos.pensamiento);
      mostrarRespuesta(datos);
      if (deltas?.length) {
        console.log(`${C.dim}🧩 ${CONFIG.nombre} cambió: ${deltas.map((d) => `${d.rasgo} ${d.delta > 0 ? "+" : ""}${d.delta}`).join(", ")}${C.reset}`);
      }
      if (accionResultado) {
        console.log(`${C.cyan}🔧 ${CONFIG.nombre} actuó en tu PC: ${C.reset}${accionResultado}`);
        console.log();
      }
    } catch (err) {
      process.stdout.write("\r\x1b[K");
      console.log(`${C.red}⚠ Error al hablar con el modelo: ${describirError(err)}${C.reset}`);
    }
  }
}

export { construirPromptSistema, conversar, mostrarPsique, guardarMemoria, memoria };

const ES_ENTRADA_PRINCIPAL = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (ES_ENTRADA_PRINCIPAL) main();
