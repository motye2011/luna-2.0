import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const BRUTO = "registro/bruto/conversaciones.jsonl";
const APROBADO = "registro/evaluado/aprobado.jsonl";
const TRAIN = "registro/dataset/train.jsonl";
const VALIDATION = "registro/dataset/validation.jsonl";

function leerJsonl(ruta) {
  if (!existsSync(ruta)) return [];
  const txt = readFileSync(ruta, "utf-8").trim();
  if (!txt) return [];
  return txt.split("\n").filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

function clasificarTipo(registro) {
  const deltas = registro.asimilacion?.deltas || [];
  const tieneCambioRasgo = deltas.length > 0;
  const sentido = registro.asimilacion?.sentido;
  if (registro.interpretacion && tieneCambioRasgo) return "interpretacion";
  if (tieneCambioRasgo) return "personalidad";
  if (sentido) return "expresion";
  return "personalidad";
}

function construirSystem(registro) {
  const rasgos = registro.contexto?.rasgos || registro.rasgosPost || {};
  const rasgosBase = registro.contexto?.rasgosBase || {};
  const emociones = registro.contexto?.emociones || registro.emocion || {};
  const percepcion = registro.contexto?.percepcion || {};

  const rasgosStr = Object.entries(rasgos).map(([k, v]) => {
    const base = rasgosBase[k];
    const desvio = base !== undefined ? ` (base ${base})` : "";
    return `${k}=${v}${desvio}`;
  }).join(", ");

  const partes = [];
  partes.push(`Eres Luna.`);
  if (rasgosStr) partes.push(`Estado de rasgos: ${rasgosStr}.`);
  if (emociones?.emoción) partes.push(`Estado emocional: ${emociones.emoción} ${emociones.intensidad ?? ""}/10.`);
  if (percepcion?.ventanas) partes.push(`Percepcion: ${String(percepcion.ventanas).slice(0, 200)}`);
  if (registro.memoriasRelevantes?.length) partes.push(`Memorias relevantes: ${registro.memoriasRelevantes.join(", ")}`);
  partes.push(`Mantén coherencia de personaje con ese estado. No rompas personaje. Responde como Luna.`);
  return partes.join("\n");
}

export async function prepararDataset({ splitValidation = 0.15 } = {}) {
  const bruto = leerJsonl(BRUTO);
  const aprobados = leerJsonl(APROBADO);

  // Fuente principal: aprobados. Si no hay valoraciones, usamos bruto con valoracion.aprobada == true o sin valoracion pero corregida
  let fuente = [];
  if (aprobados.length > 0) {
    fuente = aprobados.filter((r) => r.valoracion?.aprobada || r.corregida);
    // incluir corregidas con respuesta_corregida
  } else {
    console.log("No hay evaluados/aprobado.jsonl. Usando bruto con valoracion aprobada (si existe) o todo bruto como fallback informativo.");
    fuente = bruto.filter((r) => r.valoracion?.aprobada);
    if (fuente.length === 0) {
      console.log(`Bruto tiene ${bruto.length} registros pero ninguno valorado. Generando dataset de ejemplo con todo bruto (marcados como no curados).`);
      fuente = bruto;
    }
  }

  if (fuente.length === 0) {
    console.log("No hay datos para dataset. Usa Luna y valora con /buena /mala /corregir primero.");
    return { total: 0 };
  }

  const ejemplos = fuente.map((r) => {
    const userMsg = r.mensajes?.findLast?.((m) => m.role === "user")?.content || r.percepcion || "";
    const respuesta = r.respuesta_corregida || r.respuesta || "";
    const system = construirSystem(r);
    const tipo = clasificarTipo(r);
    // Valoracion simple para filtrar despues
    return {
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
        { role: "assistant", content: respuesta },
      ],
      tipo,
      meta: {
        fecha: r.fecha,
        id: r.id,
        tipo,
        rasgos: r.contexto?.rasgos || r.rasgosPost,
        emocion: r.emocion,
        valoracion: r.valoracion || null,
        corregida: !!r.corregida,
      },
    };
  }).filter((e) => e.messages[1].content && e.messages[2].content);

  // Shuffle
  for (let i = ejemplos.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ejemplos[i], ejemplos[j]] = [ejemplos[j], ejemplos[i]];
  }

  const nVal = Math.max(1, Math.floor(ejemplos.length * splitValidation));
  const train = ejemplos.slice(nVal);
  const validation = ejemplos.slice(0, nVal);

  // Si hay muy pocos, no separar
  let finalTrain = ejemplos;
  let finalVal = [];
  if (ejemplos.length >= 5) {
    finalTrain = train;
    finalVal = validation;
  }

  mkdirSync("registro/dataset", { recursive: true });
  writeFileSync(TRAIN, finalTrain.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf-8");
  if (finalVal.length) writeFileSync(VALIDATION, finalVal.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf-8");
  else if (existsSync(VALIDATION)) writeFileSync(VALIDATION, "", "utf-8");

  const porTipo = {};
  for (const e of ejemplos) porTipo[e.tipo] = (porTipo[e.tipo] || 0) + 1;

  console.log(`Dataset preparado: ${ejemplos.length} ejemplos`);
  console.log(`  train: ${finalTrain.length} -> ${TRAIN}`);
  if (finalVal.length) console.log(`  validation: ${finalVal.length} -> ${VALIDATION}`);
  console.log(`  por tipo: ${JSON.stringify(porTipo)}`);
  console.log(`  Formato: { messages: [system, user, assistant] } compatible con TRL/SFTTrainer`);
  if (bruto.length && aprobados.length === 0) {
    console.log(`\nConsejo: valora respuestas con /buena /mala y corrige con /corregir para curar el dataset.`);
  }
  return { total: ejemplos.length, train: finalTrain.length, validation: finalVal.length, porTipo };
}

if (import.meta.url === `file://${process.cwd().replace(/\\/g, "/")}/scripts/preparar_dataset.js` || process.argv[1]?.endsWith("preparar_dataset.js")) {
  prepararDataset();
}
