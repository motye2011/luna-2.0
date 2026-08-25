const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("luna", {
  obtenerConexion: () => ipcRenderer.invoke("conexion:obtener"),
  guardarConexion: (c) => ipcRenderer.invoke("conexion:guardar", c),
  probarConexion: (c) => ipcRenderer.invoke("conexion:probar", c),
  enviarMensaje: (mensaje) => ipcRenderer.invoke("chat:enviar", mensaje),
  estado: () => ipcRenderer.invoke("luna:estado"),
  recuerdos: () => ipcRenderer.invoke("luna:recuerdos"),
  reset: () => ipcRenderer.invoke("luna:reset"),
  onToken: (cb) => ipcRenderer.on("chat:token", (_e, texto) => cb(texto)),
  onFinal: (cb) => ipcRenderer.on("chat:final", (_e, datos) => cb(datos)),
  onError: (cb) => ipcRenderer.on("chat:error", (_e, mensaje) => cb(mensaje)),
});
