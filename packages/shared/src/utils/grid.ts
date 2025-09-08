import { Vector2 } from '../types';

export function worldToGrid(worldPos: Vector2, tileSize: number): Vector2 {
  return {
    x: Math.floor(worldPos.x / tileSize),
    y: Math.floor(worldPos.y / tileSize)
  };
}

export function gridToWorld(gridPos: Vector2, tileSize: number): Vector2 {
  return {
    x: gridPos.x * tileSize + tileSize / 2,
    y: gridPos.y * tileSize + tileSize / 2
  };
}

export function worldToIsometric(worldPos: Vector2): Vector2 {
  return {
    x: (worldPos.x - worldPos.y) * 0.5,
    y: (worldPos.x + worldPos.y) * 0.25
  };
}

export function isometricToWorld(isoPos: Vector2): Vector2 {
  return {
    x: isoPos.x + isoPos.y * 2,
    y: isoPos.y * 2 - isoPos.x
  };
}

export function getNeighbors(pos: Vector2, diagonal = false): Vector2[] {
  const neighbors: Vector2[] = [
    { x: pos.x - 1, y: pos.y },
    { x: pos.x + 1, y: pos.y },
    { x: pos.x, y: pos.y - 1 },
    { x: pos.x, y: pos.y + 1 }
  ];

  if (diagonal) {
    neighbors.push(
      { x: pos.x - 1, y: pos.y - 1 },
      { x: pos.x + 1, y: pos.y - 1 },
      { x: pos.x - 1, y: pos.y + 1 },
      { x: pos.x + 1, y: pos.y + 1 }
    );
  }

  return neighbors;
}

export function bresenhamLine(start: Vector2, end: Vector2): Vector2[] {
  const points: Vector2[] = [];
  let x0 = Math.floor(start.x);
  let y0 = Math.floor(start.y);
  const x1 = Math.floor(end.x);
  const y1 = Math.floor(end.y);
  
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  
  while (true) {
    points.push({ x: x0, y: y0 });
    
    if (x0 === x1 && y0 === y1) break;
    
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
  
  return points;
}

export function floodFill<T>(
  start: Vector2,
  isValid: (pos: Vector2) => boolean,
  visit: (pos: Vector2) => T,
  maxDistance?: number
): T[] {
  const visited = new Set<string>();
  const queue: Array<{ pos: Vector2; distance: number }> = [{ pos: start, distance: 0 }];
  const results: T[] = [];
  
  while (queue.length > 0) {
    const { pos, distance } = queue.shift()!;
    const key = `${pos.x},${pos.y}`;
    
    if (visited.has(key)) continue;
    if (maxDistance !== undefined && distance > maxDistance) continue;
    if (!isValid(pos)) continue;
    
    visited.add(key);
    results.push(visit(pos));
    
    for (const neighbor of getNeighbors(pos)) {
      const neighborKey = `${neighbor.x},${neighbor.y}`;
      if (!visited.has(neighborKey)) {
        queue.push({ pos: neighbor, distance: distance + 1 });
      }
    }
  }
  
  return results;
}

export function spiralOrder(center: Vector2, radius: number): Vector2[] {
  const points: Vector2[] = [];
  
  for (let r = 0; r <= radius; r++) {
    if (r === 0) {
      points.push(center);
      continue;
    }
    
    for (let x = -r; x <= r; x++) {
      for (let y = -r; y <= r; y++) {
        if (Math.abs(x) === r || Math.abs(y) === r) {
          points.push({ x: center.x + x, y: center.y + y });
        }
      }
    }
  }
  
  return points;
}