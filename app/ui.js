const $ = (sel) => document.querySelector(sel);

const inicio = $("#pantalla-inicio");
const chat = $("#pantalla-chat");
const inpUrl = $("#inp-url");
const inpClave = $("#inp-clave");
const errInicio = $("#err-inicio");
const btnConectar = $("#btn-conectar");
const mensajes = $("#mensajes");
const inpMensaje = $("#inp-mensaje");
const btnEnviar = $("#btn-enviar");
const animico = $("#animico");
const dot = $("#dot");

let ocupado = false;
let burbujaActual = null;
let textoActual = null;

function scrollAbajo() {
  mensajes.scrollTop = mensajes.scrollHeight;
}

function burbujaYo(texto) {
  const fila = document.createElement("div");
  fila.className = "fila yo";
  const b = document.createElement("div");
  b.className = "burbuja yo";
  b.textContent = texto;
  fila.appendChild(b);
  mensajes.appendChild(fila);
  scrollAbajo();
}

function burbujaLuna() {
  const fila = document.createElement("div");
  fila.className = "fila luna";
  const b = document.createElement("div");
  b.className = "burbuja luna";
  b.innerHTML =
    '<div class="pensamiento oculta"></div><div class="texto"></div><div class="meta"></div>';
  fila.appendChild(b);
  mensajes.appendChild(fila);
  scrollAbajo();
  return b;
}

function burbujaSistema(texto) {
  const fila = document.createElement("div");
  fila.className = "fila luna";
  const b = document.createElement("div");
  b.className = "burbuja sistema";
  b.textContent = texto;
  fila.appendChild(b);
  mensajes.appendChild(fila);
  scrollAbajo();
}

function chip(clases, texto) {
  const c = document.createElement("span");
  c.className = clases;
  c.textContent = texto;
  return c;
}

function ponerAnimico(animo) {
  if (!animo?.emoción) return;
  animico.textContent = `· ${animo.emoción} ${animo.intensidad ?? ""}/10`.replace(" /10", "/10");
}

async function conectar() {
  errInicio.textContent = "";
  const url = inpUrl.value.trim();
  const clave = inpClave.value.trim();
  if (!url || !clave) {
    errInicio.textContent = "Rellena la URL y la clave.";
    return;
  }
  btnConectar.disabled = true;
  btnConectar.textContent = "Conectando...";
  const r = await window.luna.probarConexion({ url, clave });
  btnConectar.disabled = false;
  btnConectar.textContent = "Conectar";
  if (!r.ok) {
    errInicio.textContent = r.error;
    return;
  }
  await window.luna.guardarConexion({ url, clave });
  entrarAlChat(r.estado);
}

function entrarAlChat(estado) {
  inicio.classList.add("oculta");
  chat.classList.remove("oculta");
  mensajes.innerHTML = "";
  inpClave.value = "";
  if (estado) {
    dot.className = estado.ollama ? "dot verde" : "dot rojo";
    ponerAnimico(estado.animo);
    burbujaSistema(
      estado.ollama
        ? `${estado.nombre} está aquí. Lleváis ${estado.hechos} recuerdos compartidos.`
        : `${estado.nombre} no puede hablar ahora: ${estado.modelo}`
    );
  }
}

async function enviar() {
  const texto = inpMensaje.value.trim();
  if (!texto || ocupado) return;
  ocupado = true;
  inpMensaje.value = "";
  inpMensaje.disabled = true;
  btnEnviar.disabled = true;

  burbujaYo(texto);
  burbujaActual = burbujaLuna();
  textoActual = null;
  burbujaActual.querySelector(".texto").textContent = "…";

  await window.luna.enviarMensaje(texto);

  ocupado = false;
  inpMensaje.disabled = false;
  btnEnviar.disabled = false;
  inpMensaje.focus();
}

window.luna.onToken((texto) => {
  if (!burbujaActual) return;
  textoActual = texto;
  burbujaActual.querySelector(".texto").textContent = texto;
  scrollAbajo();
});

window.luna.onFinal((datos) => {
  if (!burbujaActual) return;
  burbujaActual.querySelector(".texto").textContent = datos.respuesta || textoActual || "(silencio)";

  if (datos.pensamiento) {
    const p = burbujaActual.querySelector(".pensamiento");
    p.textContent = `💭 ${datos.pensamiento}`;
    p.classList.remove("oculta");
  }

  const meta = burbujaActual.querySelector(".meta");
  if (datos.emocion) meta.appendChild(chip("chip emocion", `${datos.emocion} ${datos.intensidad ?? ""}/10`.replace(" /10", "/10")));
  for (const d of datos.deltas || []) {
    meta.appendChild(chip(`chip delta ${d.delta > 0 ? "sube" : "baja"}`, `${d.rasgo} ${d.delta > 0 ? "+" : ""}${d.delta}`));
  }
  if (datos.accion) meta.appendChild(chip("chip", datos.accion));

  ponerAnimico({ emoción: datos.emocion, intensidad: datos.intensidad });
  burbujaActual = null;
  scrollAbajo();
});

window.luna.onError((mensaje) => {
  if (burbujaActual) {
    burbujaActual.querySelector(".texto").textContent = burbujaActual.querySelector(".texto").textContent || "";
    const meta = burbujaActual.querySelector(".meta");
    meta.appendChild(chip("chip", `⚠ ${mensaje}`));
    burbujaActual = null;
  } else {
    burbujaSistema(`⚠ ${mensaje}`);
  }
});

btnConectar.addEventListener("click", conectar);
inpClave.addEventListener("keydown", (e) => e.key === "Enter" && conectar());
inpUrl.addEventListener("keydown", (e) => e.key === "Enter" && conectar());
btnEnviar.addEventListener("click", enviar);
inpMensaje.addEventListener("keydown", (e) => e.key === "Enter" && enviar());

$("#btn-desconectar").addEventListener("click", () => {
  chat.classList.add("oculta");
  inicio.classList.remove("oculta");
  dot.className = "dot apagado";
});

$("#btn-recuerdos").addEventListener("click", async () => {
  const recuerdos = await window.luna.recuerdos();
  burbujaSistema(
    recuerdos.length
      ? `Luna recuerda:\n${recuerdos.map((r) => `• ${r}`).join("\n")}`
      : "Luna aún no recuerda nada de ti."
  );
});

$("#btn-reset").addEventListener("click", async () => {
  if (!confirm("¿Borrar TODA la memoria de Luna? No hay vuelta atrás.")) return;
  const ok = await window.luna.reset();
  mensajes.innerHTML = "";
  burbujaSistema(ok ? "Luna ha olvidado todo... empezáis de nuevo." : "No se pudo reiniciar la memoria.");
  const estado = await window.luna.estado();
  if (estado) ponerAnimico(estado.animo);
});

(async () => {
  const guardada = await window.luna.obtenerConexion();
  if (guardada?.url) {
    inpUrl.value = guardada.url;
    if (guardada.clave) inpClave.value = guardada.clave;
  }
  inpUrl.focus();
})();
