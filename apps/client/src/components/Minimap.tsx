import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../state/gameStore';
import { BIOMES, POI_TYPES, worldToGrid, TILE_SIZE } from '@dragon-isle/shared';

interface MinimapProps {
  initialCollapsed?: boolean;
  size?: number; // in pixels for docked panel
  fullscreen?: boolean; // render as fullscreen overlay
  onClose?: () => void;
}

export function Minimap({ initialCollapsed = false, size = 160, fullscreen = false, onClose }: MinimapProps) {
  const { gameState } = useGameStore();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [viewport, setViewport] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const worldSnapshot = gameState?.worldSnapshot;
  const playerWorldPos = gameState?.playerState.position;

  // Track viewport for fullscreen sizing
  useEffect(() => {
    if (!fullscreen) return;
    const update = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [fullscreen]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !worldSnapshot) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Choose canvas size
    let width = size;
    let height = size;
    if (fullscreen) {
      // Cap max dimension for performance but use as large as sensible
      const maxDim = Math.min(Math.min(viewport.w || window.innerWidth, viewport.h || window.innerHeight), 1024);
      width = maxDim;
      height = maxDim;
    }
    canvas.width = width;
    canvas.height = height;

    // Draw biomes downsampled to minimap size
    const biomeMap = worldSnapshot.biomeMap;
    const w = biomeMap[0].length;
    const h = biomeMap.length;

    const img = ctx.createImageData(width, height);
    const data = img.data;

    for (let y = 0; y < height; y++) {
      const sy = Math.floor((y / height) * h);
      for (let x = 0; x < width; x++) {
        const sx = Math.floor((x / width) * w);
        const biome = biomeMap[sy][sx] as keyof typeof BIOMES;
        const color = biomeToColor(biome);
        const idx = (y * width + x) * 4;
        data[idx + 0] = (color >> 16) & 0xff;
        data[idx + 1] = (color >> 8) & 0xff;
        data[idx + 2] = color & 0xff;
        data[idx + 3] = 255;
      }
    }
    // If fullscreen, draw with letterboxing to center square canvas
    let offsetX = 0, offsetY = 0;
    if (fullscreen) {
      // We'll center the square canvas in the overlay container via CSS; offset remains 0
    }
    ctx.putImageData(img, 0, 0);

    // Draw rivers overlay (if present)
    const rivers = (worldSnapshot as any).rivers as { points: { x: number; y: number }[]; width: number }[] | undefined;
    if (rivers && rivers.length && rivers[0]?.points?.length) {
      ctx.save();
      ctx.strokeStyle = '#3b82f6';
      ctx.globalAlpha = 0.9;
      for (const river of rivers) {
        const pts = river.points;
        if (!pts || pts.length < 2) continue;
        // Scale stroke width based on river width and minimap resolution
        const lw = Math.max(1, Math.floor(river.width * (width / w)));
        ctx.lineWidth = lw;
        ctx.beginPath();
        const p0x = Math.floor((pts[0].x / w) * width) + offsetX;
        const p0y = Math.floor((pts[0].y / h) * height) + offsetY;
        ctx.moveTo(p0x, p0y);
        for (let i = 1; i < pts.length; i++) {
          const px = Math.floor((pts[i].x / w) * width) + offsetX;
          const py = Math.floor((pts[i].y / h) * height) + offsetY;
          ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // Draw history map markers
    const markers = (worldSnapshot as any).historyIndex?.mapMarkers as { position: {x:number;y:number}; epoch: number; label: string; tag: string }[] | undefined;
    if (markers && markers.length) {
      for (const m of markers) {
        const mx = Math.floor((m.position.x / w) * width) + offsetX;
        const my = Math.floor((m.position.y / h) * height) + offsetY;
        ctx.fillStyle = '#fbbf24'; // amber
        ctx.beginPath();
        ctx.arc(mx, my, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw POIs with placeholder art + labels
    const pois = (worldSnapshot.pois || []) as any[];
    if (pois.length) {
      for (const p of pois) {
        const vx = Math.floor((p.position.x / w) * width) + offsetX;
        const vy = Math.floor((p.position.y / h) * height) + offsetY;
        drawPOIIcon(ctx, vx, vy, p.type);
        if (p.name) drawLabel(ctx, vx + 8, vy - 8, p.name);
        // Subtle hint if close to player: draw outline
        if (playerWorldPos) {
          const grid = worldToGrid(playerWorldPos, TILE_SIZE);
          const dx = Math.abs(grid.x - p.position.x);
          const dy = Math.abs(grid.y - p.position.y);
          if (dx <= 3 && dy <= 3) {
            ctx.strokeStyle = 'rgba(255,255,255,0.7)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(vx, vy, 7, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }
    }

    // Draw player marker
    if (playerWorldPos) {
      const grid = worldToGrid(playerWorldPos, TILE_SIZE);
      const px = Math.floor((grid.x / w) * width) + offsetX;
      const py = Math.floor((grid.y / h) * height) + offsetY;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }, [worldSnapshot, playerWorldPos, size, fullscreen, viewport]);

  if (!worldSnapshot) return null;

  if (fullscreen) {
    // Fullscreen overlay
    return (
      <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
        <div className="relative">
          <canvas ref={canvasRef} className="rounded-md border border-gray-700 shadow-2xl" style={{ width: Math.min(viewport.w || window.innerWidth, 1024), height: Math.min(viewport.h || window.innerHeight, 1024) }} />
          <button
            className="absolute -top-3 -right-3 ui-panel p-2"
            onClick={onClose}
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  // Docked panel (collapsible)
  return (
    <div className="absolute bottom-4 right-4 safe-area-inset" style={{ zIndex: 50 }}>
      {!collapsed ? (
        <div className="ui-panel p-2 flex flex-col items-end gap-2">
          <canvas ref={canvasRef} className="rounded-md border border-gray-700" style={{ width: size, height: size }} />
          <button className="btn-secondary" onClick={() => setCollapsed(true)} title="Collapse minimap">
            ▾ Minimap
          </button>
        </div>
      ) : (
        <button className="ui-panel p-2" onClick={() => setCollapsed(false)} title="Expand minimap">
          🗺️
        </button>
      )}
    </div>
  );
}

function biomeToColor(biome: string): number {
  const colors: Record<string, number> = {
    [BIOMES.OCEAN]: 0x2c5f7c,
    [BIOMES.BEACH]: 0xf4e4c1,
    [BIOMES.COAST]: 0xe9d8a6,
    [BIOMES.GRASSLAND]: 0x7cb342,
    [BIOMES.FOREST]: 0x2e7d32,
    [BIOMES.RAINFOREST]: 0x1b5e20,
    [BIOMES.SAVANNA]: 0xb8a13a,
    [BIOMES.SHRUBLAND]: 0x9e9d24,
    [BIOMES.TAIGA]: 0x335c3e,
    [BIOMES.TUNDRA]: 0x8e9a9b,
    [BIOMES.DESERT]: 0xdeb887,
    [BIOMES.HILLS]: 0x8d6e63,
    [BIOMES.MOUNTAIN]: 0x757575,
    [BIOMES.ALPINE]: 0xcfd8dc,
    [BIOMES.SWAMP]: 0x4a5d3a
  };
  return colors[biome] ?? 0x000000;
}

// --- POI placeholder art and labels ---
function poiColor(type: string): string {
  switch (type) {
    case POI_TYPES.VILLAGE: return '#22c55e';
    case POI_TYPES.RUINED_CASTLE: return '#9ca3af';
    case POI_TYPES.WIZARDS_TOWER: return '#a855f7';
    case POI_TYPES.DARK_CAVE: return '#6b7280';
    case POI_TYPES.DRAGON_GROUNDS: return '#f59e0b';
    case POI_TYPES.LIGHTHOUSE: return '#93c5fd';
    case POI_TYPES.ANCIENT_CIRCLE: return '#f472b6';
    default: return '#e5e7eb';
  }
}

function drawPOIIcon(ctx: CanvasRenderingContext2D, x: number, y: number, type: string) {
  const c = poiColor(type);
  // Contrast ring
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fill();
  ctx.translate(x, y);
  ctx.fillStyle = c;
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 1;
  switch (type) {
    case POI_TYPES.VILLAGE: {
      // House: square + roof
      ctx.beginPath();
      ctx.rect(-3, -1, 6, 4);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-3.5, -1);
      ctx.lineTo(0, -4);
      ctx.lineTo(3.5, -1);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case POI_TYPES.RUINED_CASTLE: {
      // Keep/tower block
      ctx.beginPath();
      ctx.rect(-3, -3, 6, 6);
      ctx.fill();
      // Crenellations
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(-2.5, -3, 1, 1);
      ctx.fillRect(-0.5, -3, 1, 1);
      ctx.fillRect(1.5, -3, 1, 1);
      break;
    }
    case POI_TYPES.WIZARDS_TOWER: {
      // Tall tower
      ctx.beginPath();
      ctx.rect(-2, -4, 4, 8);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-2.5, -4);
      ctx.lineTo(0, -6);
      ctx.lineTo(2.5, -4);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case POI_TYPES.DARK_CAVE: {
      // Cave arch
      ctx.beginPath();
      ctx.moveTo(-4, 2);
      ctx.quadraticCurveTo(0, -4, 4, 2);
      ctx.lineTo(-4, 2);
      ctx.fill();
      break;
    }
    case POI_TYPES.DRAGON_GROUNDS: {
      // Egg shape
      ctx.beginPath();
      ctx.ellipse(0, 0, 3, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case POI_TYPES.LIGHTHOUSE: {
      // Slender tower with beam
      ctx.beginPath();
      ctx.rect(-1.5, -4, 3, 8);
      ctx.fill();
      ctx.strokeStyle = c;
      ctx.beginPath();
      ctx.moveTo(0, -3);
      ctx.lineTo(6, -5);
      ctx.moveTo(0, -3);
      ctx.lineTo(6, -1);
      ctx.stroke();
      break;
    }
    case POI_TYPES.ANCIENT_CIRCLE: {
      // Ring
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.strokeStyle = c;
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    }
    default: {
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string) {
  ctx.save();
  ctx.font = '10px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
  ctx.textBaseline = 'top';
  // Background box for contrast
  const paddingX = 3;
  const paddingY = 2;
  const metrics = ctx.measureText(text);
  const w = Math.ceil(metrics.width) + paddingX * 2;
  const h = 12;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  roundRect(ctx, x - 1, y - 1, w, h, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  roundRect(ctx, x - 1, y - 1, w, h, 3);
  ctx.stroke();
  // Text
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, x - 1 + paddingX, y - 1 + paddingY);
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
