import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Phaser from 'phaser';
import { MainScene } from '../game/scenes/MainScene';
import { GameHUD } from './GameHUD';
import { useGameStore } from '../state/gameStore';
import { TerrainGenerator } from '../procgen/terrain';
import { WorldGenerator } from '../procgen/world';
import { generateNPCs } from '../procgen/npc';
import { HistorySummary } from './HistorySummary';
import { worldToGrid, TILE_SIZE } from '@dragon-isle/shared';

export function GameView() {
  const navigate = useNavigate();
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { gameState, currentSeed, updateWorldSnapshot } = useGameStore();
  const [isGenerating, setIsGenerating] = useState(true);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [showHistory, setShowHistory] = useState(false);

  // Debug logging removed

  useEffect(() => {
    if (!gameState) {
      navigate('/');
      return;
    }

    const generateWorld = async () => {
      setIsGenerating(true);
      setGenerationProgress(0);

      // Add delay to allow UI to update
      await new Promise(resolve => setTimeout(resolve, 100));
      const terrainGen = new TerrainGenerator(currentSeed);
      setGenerationProgress(10);
      
      // Add delay before terrain generation
      await new Promise(resolve => setTimeout(resolve, 100));
      const startTime = performance.now();
      const terrainData = await terrainGen.generate();
      const terrainTime = performance.now() - startTime; // kept for potential future metrics
      setGenerationProgress(50);

      const isLoadedGame = !!gameState.worldSnapshot; // loaded saves have a snapshot
      let playerStartGrid = terrainGen.findSpawnPoint(terrainData);
      if (isLoadedGame && gameState.playerState?.position) {
        const saved = gameState.playerState.position;
        const candidate = worldToGrid(saved, TILE_SIZE);
        // Bounds/land check
        if (
          candidate.x >= 0 && candidate.y >= 0 &&
          candidate.y < terrainData.heightMap.length &&
          candidate.x < terrainData.heightMap[0].length &&
          terrainData.heightMap[candidate.y][candidate.x] > 0 // above 0 elevation (coarse check)
        ) {
          playerStartGrid = { x: candidate.x, y: candidate.y };
        }
      }

      // Add delay before world generation
      await new Promise(resolve => setTimeout(resolve, 100));
      const worldStartTime = performance.now();
      const worldGen = new WorldGenerator(currentSeed);
      const worldSnapshot = worldGen.generate(terrainData, playerStartGrid);
      const worldTime = performance.now() - worldStartTime; // kept for potential future metrics
      setGenerationProgress(80);
      
      // Ensure connectivity between spawn point and POIs
      const importantPoints = [
        playerStartGrid,
        ...worldSnapshot.pois.map(poi => ({ x: poi.position.x, y: poi.position.y }))
      ];
      
      terrainGen.ensureConnectivity(terrainData, importantPoints);
      updateWorldSnapshot(worldSnapshot);

      // Generate initial NPCs based on world + history
      const initialNPCs = generateNPCs(worldSnapshot, playerStartGrid);
      if (initialNPCs.length) {
        const { setNPCs } = useGameStore.getState() as any;
        setNPCs(initialNPCs);
      }
      setGenerationProgress(100);
      // generation complete
      
      // Add final delay before proceeding
      await new Promise(resolve => setTimeout(resolve, 200));

      if (!containerRef.current) {
        return;
      }

      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }

      // Initialize Phaser game
      const params = new URLSearchParams(window.location.search);
      const forceCanvas = params.get('renderer') === 'canvas';
      const forceWebGL = params.get('renderer') === 'webgl';
      // Default to Canvas to avoid GPU/driver instability; opt-in to WebGL with ?renderer=webgl
      const desiredType = forceWebGL ? Phaser.WEBGL : Phaser.CANVAS;

      // Basic capability probe
      const probe = document.createElement('canvas');
      const gl = forceWebGL ? (probe.getContext('webgl') || probe.getContext('experimental-webgl')) : null;
      // Silent WebGL probe
      const config: Phaser.Types.Core.GameConfig = {
        type: desiredType,
        parent: containerRef.current,
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: '#1a1a2e',
        physics: {
          default: 'arcade',
          arcade: {
            gravity: { y: 0 },
            debug: false
          }
        },
        scene: [MainScene],
        scale: {
          mode: Phaser.Scale.RESIZE,
          autoCenter: Phaser.Scale.CENTER_BOTH
        },
        input: {
          activePointers: 3
        },
        render: {
          pixelArt: true,
          antialias: false,
          // Context creation flags to reduce GPU strain
          desynchronized: true as any,
          // @ts-ignore - pass-through to WebGL context
          premultipliedAlpha: false,
          // @ts-ignore
          preserveDrawingBuffer: false
        }
      };

      gameRef.current = new Phaser.Game(config);
      try {
        const canvasEl = (gameRef.current as any).canvas as HTMLCanvasElement | undefined;
        if (canvasEl) {
          canvasEl.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            try {
              if (gameRef.current) {
                gameRef.current.destroy(true);
                gameRef.current = null;
              }
            } finally {
              const url = new URL(window.location.href);
              url.searchParams.set('renderer', 'canvas');
              url.searchParams.set('nocache', Date.now().toString());
              window.location.replace(url.toString());
            }
          }, false);
          canvasEl.addEventListener('webglcontextrestored', (e) => {
            // no-op
          }, false);
        }
      } catch (e) {
        // ignore
      }
      
      gameRef.current.scene.start('MainScene', {
        terrainData,
        playerPosition: playerStartGrid,
        worldSnapshot
      });
      setIsGenerating(false);
      setShowHistory(true);
    };

    generateWorld();

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  const handleSave = async () => {
    const { saveGame } = useGameStore.getState();
    await saveGame();
  };

  const handleExit = async () => {
    try {
      const { saveGame } = useGameStore.getState();
      await saveGame();
    } catch (e) { /* ignore */ }
    if (gameRef.current) {
      gameRef.current.destroy(true);
      gameRef.current = null;
    }
    navigate('/');
  };

  // Autosave at intervals and on tab hide/close
  useEffect(() => {
    const { saveGame } = useGameStore.getState();
    let saving = false;
    const autosave = async () => {
      if (saving) return;
      saving = true;
      try { await saveGame(); } catch {}
      saving = false;
    };
    const autosaveMs = 120000; // 2 minutes
    const timer = window.setInterval(autosave, autosaveMs);
    const onVisibility = () => { if (document.visibilityState === 'hidden') autosave(); };
    const onPageHide = () => { autosave(); };
    window.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* Always render the game container, but hide it during generation */}
      <div 
        ref={containerRef} 
        className={`absolute inset-0 game-canvas ${isGenerating ? 'invisible' : 'visible'}`} 
      />
      
      {/* Loading screen overlay */}
      {isGenerating && (
        <div className="absolute inset-0 min-h-screen bg-dragon-dark flex flex-col items-center justify-center z-50">
          <div className="text-center space-y-4">
            <h2 className="text-2xl font-bold text-dragon-primary">Generating Island...</h2>
            <div className="w-64 h-2 bg-gray-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-dragon-primary transition-all duration-300"
                style={{ width: `${generationProgress}%` }}
              />
            </div>
            <p className="text-gray-400">Seed: {currentSeed}</p>
          </div>
        </div>
      )}
      
      {/* Game HUD - only show when not generating */}
      {!isGenerating && <GameHUD onSave={handleSave} onExit={handleExit} />}

      {/* History summary modal on start */}
      {!isGenerating && showHistory && (
        <HistorySummary onClose={() => setShowHistory(false)} />
      )}
    </div>
  );
}
