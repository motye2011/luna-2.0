# Desplegar Luna en Oracle Cloud (gratis)

Luna es una app de terminal: en el servidor vive dentro de una sesión `tmux` y
hablas con ella por SSH desde cualquier PC. La psique, la memoria y el registro
funcionan igual; solo cambia que Luna ya no puede tocar tu PC (te lo dirá si
le pides abrir o cerrar algo).

## 1. Crear la instancia

En Oracle Cloud → Compute → Create Instance:

| Opción | Valor |
|---|---|
| Imagen | Ubuntu 22.04 (aarch64) |
| Shape | **Ampere A1 (Always Free)** |
| OCPUs | 4 |
| RAM | 24 GB (viene sola con 4 OCPU) |
| Boot volume | 50 GB es suficiente |
| Clave SSH | Tu clave pública (o genera una en el asistente) |

En **Security List** deja solo el puerto `22` abierto. **No abras 11434**
(Ollama): solo Luna lo usa localmente.

> Si el registro en Oracle te rechaza o no hay capacidad A1 en tu región,
> prueba otra región home (p. ej. Madrid) o inténtalo a otra hora: la
> disponibilidad de instancias free va y viene.

## 2. Conectarte

```bash
ssh -i tu_clave.key ubuntu@IP_PUBLICA
```

## 3. Instalar Luna (un solo comando)

```bash
git clone https://github.com/motye2011/luna-2.0.git
cd luna-2.0
bash deploy/setup-oracle.sh
```

El script instala Node.js 20, Ollama (como servicio de systemd, arranca solo
al encender el servidor) y descarga el modelo de `config.json`. Los hilos del
modelo se ajustan solos a los cores del servidor.

## 4. Hablar con Luna

```bash
tmux new -s luna
node index.js
```

- Salir de tmux sin cerrar Luna: `Ctrl+B` y luego `D`
- Volver a entrar: `tmux attach -t luna`
- Ver sesiones: `tmux ls`

## 5. Mantenimiento

```bash
# Actualizar a una versión nueva
cd ~/luna-2.0 && git pull

# Copiar TU memoria local al servidor (para no empezar de cero)
scp memoria.json ubuntu@IP_PUBLICA:~/luna-2.0/

# Copia de seguridad de la memoria del servidor a tu PC
scp ubuntu@IP_PUBLICA:~/luna-2.0/memoria.json ./backup-memoria.json
```

## Notas

- **Velocidad**: sin GPU, espera ~2-5 tok/s. Es lo normal en CPU.
- **Acciones de PC**: `abrir_aplicacion` y `cerrar_aplicacion` solo funcionan
  en tu Windows local. En el servidor Luna lo explica y no intenta nada.
  `estado_sistema` sí funciona: reporta CPU/RAM del servidor.
- **Privacidad**: `memoria.json` y `registro/` viven solo en el servidor y
  están en `.gitignore`. Haz copias de seguridad periódicas del paso 5.
- **Modelo más ligero**: si va muy lenta, en `config.json` cambia
  `"modelo": "qwen3:8b"` por `"qwen3:4b"` y ejecuta `ollama pull qwen3:4b`.
