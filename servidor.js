import { createServer } from "node:http";
import { timingSafeEqual, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { conversar, memoria, reiniciarMemoria } from "./index.js";
import { verificarModelo, describirErrorModelo } from "./modelo.js";

const CONFIG = JSON.parse(readFileSync("config.json", "utf-8"));
const PUERTO = Number(process.env.LUNA_PUERTO || CONFIG.servidor?.puerto || 8787);
const ARCHIVO_CLAVE = "clave-servidor.local";

function cargarClave() {
  if (process.env.LUNA_CLAVE) return process.env.LUNA_CLAVE;
  if (CONFIG.servidor?.clave) return CONFIG.servidor.clave;
  if (existsSync(ARCHIVO_CLAVE)) return readFileSync(ARCHIVO_CLAVE, "utf-8").trim();
  const clave = randomBytes(9).toString("base64url");
  writeFileSync(ARCHIVO_CLAVE, clave, "utf-8");
  return clave;
}

const CLAVE = cargarClave();

function claveValida(recibida) {
  if (typeof recibida !== "string" || recibida.length === 0) return false;
  const a = Buffer.from(recibida);
  const b = Buffer.from(CLAVE);
  return a.length === b.length && timingSafeEqual(a, b);
}

function extraerRespuestaParcial(buf) {
  const i = buf.indexOf('"respuesta":"');
  if (i === -1) return null;
  return buf.slice(i + 13).replace(/\\n/g, "\n").replace(/\\"/g, '"');
}

function responderJson(res, status, datos) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(datos));
}

async function leerCuerpo(req, limite = 16_000) {
  let cuerpo = "";
  for await (const trozo of req) {
    cuerpo += trozo;
    if (cuerpo.length > limite) throw new Error("cuerpo demasiado grande");
  }
  return cuerpo;
}

let cola = Promise.resolve();

const servidor = createServer(async (req, res) => {
  req.on("error", () => {});
  res.on("error", () => {});

  const ruta = new URL(req.url, "http://localhost").pathname;

  if (ruta === "/") {
    return responderJson(res, 200, { servicio: "luna", ok: true });
  }

  if (!claveValida(req.headers["x-luna-clave"])) {
    return responderJson(res, 401, { error: "Clave incorrecta o ausente." });
  }

  try {
    if (ruta === "/api/estado" && req.method === "GET") {
      const modelo = await verificarModelo();
      const rasgos = Object.entries(memoria.trazos ?? {})
        .map(([nombre, t]) => ({ nombre, valor: t.valor, base: t.base }))
        .sort((a, b) => Math.abs(b.valor - b.base) - Math.abs(a.valor - a.base))
        .slice(0, 5);
      return responderJson(res, 200, {
        ok: true,
        nombre: CONFIG.nombre,
        ollama: modelo.ok,
        modelo: modelo.ok ? modelo.name : modelo.motivo,
        animo: memoria.estadoDeAnimo,
        rasgos,
        hechos: (memoria.hechosDelUsuario || []).length,
      });
    }

    if (ruta === "/api/recuerdos" && req.method === "GET") {
      return responderJson(res, 200, { recuerdos: memoria.hechosDelUsuario || [] });
    }

    if (ruta === "/api/reset" && req.method === "POST") {
      reiniciarMemoria();
      return responderJson(res, 200, { ok: true });
    }

    if (ruta === "/api/chat" && req.method === "POST") {
      const cuerpo = JSON.parse(await leerCuerpo(req));
      const mensaje = String(cuerpo?.mensaje ?? "").trim().slice(0, 4000);
      if (!mensaje) return responderJson(res, 400, { error: "Mensaje vacío." });

      res.writeHead(200, {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      const envio = (o) => res.write(JSON.stringify(o) + "\n");

      const tarea = cola.then(async () => {
        let buf = "";
        try {
          const r = await conversar(
            mensaje,
            (frag) => {
              buf += frag;
              const parcial = extraerRespuestaParcial(buf);
              if (parcial) envio({ tipo: "token", texto: parcial });
            },
            () => false
          );
          envio({
            tipo: "final",
            respuesta: r.datos.respuesta ?? "",
            emocion: r.datos.emoción ?? "neutral",
            intensidad: r.datos.intensidad ?? 5,
            pensamiento: r.datos.pensamiento ?? null,
            deltas: r.deltas ?? [],
            accion: r.accionResultado,
          });
        } catch (err) {
          envio({ tipo: "error", mensaje: describirErrorModelo(err) });
        }
      });
      cola = tarea.catch(() => {});
      await tarea;
      return res.end();
    }

    responderJson(res, 404, { error: "Ruta no encontrada." });
  } catch (err) {
    if (!res.headersSent) responderJson(res, 500, { error: err?.message || "Error interno." });
  }
});

servidor.listen(PUERTO, () => {
  console.log(`API de ${CONFIG.nombre} escuchando en el puerto ${PUERTO}`);
  console.log(`Clave de acceso: ${CLAVE}`);
  console.log("(usa esta clave en la app de escritorio para conectarte)");
});
