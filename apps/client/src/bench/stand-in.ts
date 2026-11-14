// The stand-in scene: a street at golden hour drawn flat on a 2D canvas, with
// buildings sliding past as the "camera" moves along a fixed path. It exists
// so the bench and its harness can be built and trusted before the renderer
// is (Task 1.1). It is cheap on purpose and says nothing about how the game
// will run. Colours are read from the tokens, so none is written here.

import { type BenchScene } from "./bench.ts";

export function standInScene(): BenchScene {
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  const colour: Record<string, string> = {};

  return {
    name: "stand-in street (2D)",
    standIn: true,
    setup(target) {
      canvas = target;
      const ratio = Math.min(2, window.devicePixelRatio);
      canvas.width = Math.round(canvas.clientWidth * ratio);
      canvas.height = Math.round(canvas.clientHeight * ratio);
      ctx = canvas.getContext("2d");
      const style = getComputedStyle(document.documentElement);
      for (const name of ["calor-2", "calor-1", "papel", "terra", "tinta", "noite-2", "azul", "luz", "dourado"]) {
        colour[name] = style.getPropertyValue(`--n-${name}`).trim();
      }
    },
    frame(seconds) {
      if (!canvas || !ctx) return;
      const { width: w, height: h } = canvas;
      const sky = ctx.createLinearGradient(0, 0, 0, h * 0.7);
      sky.addColorStop(0, colour["calor-2"]!);
      sky.addColorStop(0.7, colour["calor-1"]!);
      sky.addColorStop(1, colour.papel!);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      // The low sun.
      ctx.fillStyle = colour.luz!;
      ctx.beginPath();
      ctx.arc(w * 0.7, h * 0.52, w * 0.07, 0, Math.PI * 2);
      ctx.fill();
      // Three rows of buildings at three distances, each sliding at its own pace: the fixed path.
      const rows = [
        { y: 0.5, height: 0.2, pace: 20, shade: "terra", count: 9 },
        { y: 0.56, height: 0.26, pace: 45, shade: "noite-2", count: 7 },
        { y: 0.66, height: 0.34, pace: 90, shade: "tinta", count: 5 },
      ] as const;
      for (const row of rows) {
        ctx.fillStyle = colour[row.shade]!;
        const pitch = w / row.count;
        const offset = ((seconds * row.pace * w) / 400) % pitch;
        for (let i = -1; i <= row.count; i++) {
          // Heights vary by a fixed pattern, so the same second always draws the same frame.
          const tall = h * row.height * (0.6 + 0.4 * (((i + Math.floor((seconds * row.pace * w) / 400 / pitch)) * 7919) % 5) / 4);
          ctx.fillRect(i * pitch - offset + pitch * 0.08, h * row.y + h * row.height - tall, pitch * 0.84, tall + h);
        }
      }
      // The road and its centre line, and a blue and white van that keeps pace.
      ctx.fillStyle = colour.tinta!;
      ctx.fillRect(0, h * 0.86, w, h * 0.14);
      ctx.fillStyle = colour.luz!;
      const dash = w / 8;
      const slide = (seconds * w * 0.9) % dash;
      for (let x = -slide; x < w; x += dash) ctx.fillRect(x, h * 0.925, dash * 0.5, h * 0.008);
      const vanX = w * 0.3 + Math.sin(seconds * 0.8) * w * 0.05;
      ctx.fillStyle = colour.luz!;
      ctx.fillRect(vanX, h * 0.83, w * 0.2, h * 0.05);
      ctx.fillStyle = colour.azul!;
      ctx.fillRect(vanX, h * 0.865, w * 0.2, h * 0.03);
    },
    dispose() {
      canvas = null;
      ctx = null;
    },
  };
}
