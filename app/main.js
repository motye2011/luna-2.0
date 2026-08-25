const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

let ventana = null;

const archivoConexion = () => path.join(app.getPath("userData"), "luna-conexion.json");

function leerConexion() {
  try {
    return JSON.parse(fs.readFileSync(archivoConexion(), "utf-8"));
  } catch {
    return null;
  }
}

function guardarConexion(conexion) {
  fs.writeFileSync(archivoConexion(), JSON.stringify(conexion, null, 2), "utf-8");
}

function normalizarUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

async function pedir(url, clave, ruta, opciones = {}) {
  const res = await fetch(`${normalizarUrl(url)}${ruta}`, {
    ...opciones,
    headers: { "x-luna-clave": String(clave ?? ""), ...(opciones.headers || {}) },
    signal: AbortSignal.timeout(opciones.timeoutMs ?? 10_000),
  });
  return res;
}

function crearVentana() {
  ventana = new BrowserWindow({
    width: 460,
    height: 780,
    minWidth: 360,
    minHeight: 560,
    backgroundColor: "#12101a",
    autoHideMenuBar: true,
    title: "Luna",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  ventana.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(crearVentana);
app.on("window-all-closed", () => app.quit());

ipcMain.handle("conexion:obtener", () => {
  const c = leerConexion();
  return c ? { url: c.url, clave: c.clave } : null;
});

ipcMain.handle("conexion:guardar", (_e, conexion) => {
  guardarConexion({ url: normalizarUrl(conexion.url), clave: String(conexion.clave ?? "") });
  return true;
});

ipcMain.handle("conexion:probar", async (_e, conexion) => {
  try {
    const res = await pedir(conexion.url, conexion.clave, "/api/estado");
    if (res.status === 401) return { ok: false, error: "Clave incorrecta." };
    if (!res.ok) return { ok: false, error: `El servidor respondió ${res.status}.` };
    return { ok: true, estado: await res.json() };
  } catch {
    return { ok: false, error: "No pude conectar. Revisa la URL del servidor." };
  }
});

ipcMain.handle("chat:enviar", async (_e, mensaje) => {
  const c = leerConexion();
  if (!c?.url) {
    ventana.webContents.send("chat:error", "Sin conexión configurada.");
    return { ok: false };
  }
  try {
    const res = await pedir(c.url, c.clave, "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensaje }),
      timeoutMs: 600_000,
    });
    if (res.status === 401) {
      ventana.webContents.send("chat:error", "Clave incorrecta.");
      return { ok: false };
    }
    if (!res.ok) {
      ventana.webContents.send("chat:error", `El servidor respondió ${res.status}.`);
      return { ok: false };
    }
    const lector = res.body.getReader();
    const decodificador = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await lector.read();
      if (done) break;
      buffer += decodificador.decode(value, { stream: true });
      let salto;
      while ((salto = buffer.indexOf("\n")) !== -1) {
        const linea = buffer.slice(0, salto).trim();
        buffer = buffer.slice(salto + 1);
        if (!linea) continue;
        try {
          const ev = JSON.parse(linea);
          if (ev.tipo === "token") ventana.webContents.send("chat:token", ev.texto);
          else if (ev.tipo === "final") ventana.webContents.send("chat:final", ev);
          else if (ev.tipo === "error") ventana.webContents.send("chat:error", ev.mensaje);
        } catch {}
      }
    }
    return { ok: true };
  } catch {
    ventana.webContents.send("chat:error", `Se perdió la conexión con ${c.url}.`);
    return { ok: false };
  }
});

ipcMain.handle("luna:estado", async () => {
  const c = leerConexion();
  try {
    const res = await pedir(c?.url, c?.clave, "/api/estado");
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
});

ipcMain.handle("luna:recuerdos", async () => {
  const c = leerConexion();
  try {
    const res = await pedir(c?.url, c?.clave, "/api/recuerdos");
    if (!res.ok) return [];
    const datos = await res.json();
    return datos.recuerdos || [];
  } catch {
    return [];
  }
});

ipcMain.handle("luna:reset", async () => {
  const c = leerConexion();
  try {
    const res = await pedir(c?.url, c?.clave, "/api/reset", { method: "POST" });
    return res.ok;
  } catch {
    return false;
  }
});
