# Titan APC Mapper

Aplicación de escritorio para mapear un **Akai APC Mini** (original o MK2) a playbacks, cue lists y ejecutores de **Avolites Titan** mediante la Titan Web API.

## Requisitos

- Node.js 20+
- Una consola o PC con Titan (no Titan One / T1) en la misma red, API en el puerto `4430`
- Controlador Akai APC Mini conectado por USB

## Desarrollo

```bash
npm install
npm run dev
```

## Uso

1. Conecta el APC Mini. La app intenta detectarlo automáticamente (entrada + salida MIDI).
2. Abre **Titan** e introduce la IP de la consola y el puerto (`4430`).
3. Selecciona un pad, botón o fader y asigna un playback de la lista (clic o drag & drop).
4. Elige el modo de disparo: **Flash**, **Latch**, **Swop** o **Go**.
5. El color LED se envía de vuelta al APC. Si Titan marca el playback como activo, el LED parpadea.
6. Guarda o carga el perfil JSON para reutilizar el mapeo entre shows.

## Arquitectura

- `src/main` — Electron: ventana, proxy HTTP hacia Titan (evita CORS) y diálogos de perfil
- `src/preload` — Bridge IPC tipado
- `src/renderer` — React + TypeScript
  - `services/MidiService.ts` — WebMidi, auto-detección APC Mini y feedback LED
  - `services/TitanApiService.ts` — handles, fire/kill/flash/swop/go y niveles
  - `services/MappingEngine.ts` — traduce MIDI → comandos Titan y actualiza LEDs

Los faders envían `SetPlaybackLevel`. Los perfiles se guardan como JSON local (`versión 1`).
