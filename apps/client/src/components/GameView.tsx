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

  console.log('🔄 GameView render - isGenerating:', isGenerating, 'currentSeed:', currentSeed);

  useEffect(() => {
    if (!gameState) {
      navigate('/');
      return;
    }

    const generateWorld = async () => {
      console.log('🏝️ Starting world generation with seed:', currentSeed);
      setIsGenerating(true);
      setGenerationProgress(0);

      // Add delay to allow UI to update
      await new Promise(resolve => setTimeout(resolve, 100));
      console.log('🔧 Initializing terrain generator...');

      const terrainGen = new TerrainGenerator(currentSeed);
      setGenerationProgress(10);
      console.log('📊 Progress: 10% - Terrain generator ready');
      
      // Add delay before terrain generation
      await new Promise(resolve => setTimeout(resolve, 100));
      console.log('🗻 Starting terrain generation...');
      const startTime = performance.now();
      const terrainData = await terrainGen.generate();
      const terrainTime = performance.now() - startTime;
      console.log(`✅ Terrain generation complete in ${terrainTime.toFixed(2)}ms`);
      console.log('📊 Progress: 50% - Terrain data ready');
      setGenerationProgress(50);

      console.log('🎯 Determining player start position...');
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
          console.log('✅ Using saved player position from save:', saved, 'grid:', playerStartGrid);
        } else {
          console.warn('⚠️ Saved player position out of bounds or not land; using spawn instead:', saved);
        }
      } else {
        console.log('ℹ️ New game — using spawn point');
      }

      // Add delay before world generation
      await new Promise(resolve => setTimeout(resolve, 100));
      console.log('🌍 Starting world feature generation...');
      const worldStartTime = performance.now();
      const worldGen = new WorldGenerator(currentSeed);
      const worldSnapshot = worldGen.generate(terrainData, playerStartGrid);
      const worldTime = performance.now() - worldStartTime;
      console.log(`✅ World generation complete in ${worldTime.toFixed(2)}ms`);
      console.log('📊 Progress: 80% - World snapshot ready');
      setGenerationProgress(80);
      
      // Ensure connectivity between spawn point and POIs
      const importantPoints = [
        playerStartGrid,
        ...worldSnapshot.pois.map(poi => ({ x: poi.position.x, y: poi.position.y }))
      ];
      
      console.log('🛤️ Ensuring walkable paths between important locations...');
      terrainGen.ensureConnectivity(terrainData, importantPoints);
      
      console.log('💾 Updating world snapshot in store...');
      updateWorldSnapshot(worldSnapshot);

      // Generate initial NPCs based on world + history
      const initialNPCs = generateNPCs(worldSnapshot, playerStartGrid);
      if (initialNPCs.length) {
        const { setNPCs } = useGameStore.getState() as any;
        setNPCs(initialNPCs);
      }
      setGenerationProgress(100);
      console.log('📊 Progress: 100% - World generation complete');

      // Add final delay before proceeding
      await new Promise(resolve => setTimeout(resolve, 200));

      console.log('🔍 Checking Phaser initialization conditions...');
      console.log('Container ref exists:', !!containerRef.current);
      console.log('Game ref exists:', !!gameRef.current);
      console.log('Is generating:', isGenerating);

      if (!containerRef.current) {
        console.error('❌ Container ref is null - cannot initialize Phaser');
        console.error('Container element:', containerRef.current);
        console.error('Document body children:', document.body.children.length);
        return;
      }

      if (gameRef.current) {
        console.log('⚠️ Game instance already exists, destroying it first...');
        gameRef.current.destroy(true);
        gameRef.current = null;
      }

      console.log('🎮 Initializing Phaser game...');
      const params = new URLSearchParams(window.location.search);
      const forceCanvas = params.get('renderer') === 'canvas';
      const forceWebGL = params.get('renderer') === 'webgl';
      // Default to Canvas to avoid GPU/driver instability; opt-in to WebGL with ?renderer=webgl
      const desiredType = forceWebGL ? Phaser.WEBGL : Phaser.CANVAS;
      console.log('🧭 Renderer selection:', { forceCanvas, forceWebGL, desiredTypeName: desiredType === Phaser.WEBGL ? 'WEBGL' : 'CANVAS' });

      // Basic capability probe
      const probe = document.createElement('canvas');
      const gl = forceWebGL ? (probe.getContext('webgl') || probe.getContext('experimental-webgl')) : null;
      console.log('🔎 WebGL probe:', {
        available: !!gl,
        renderer: gl && (gl.getParameter ? gl.getParameter((gl as any).RENDERER) : undefined),
        version: gl && (gl.getParameter ? gl.getParameter((gl as any).VERSION) : undefined)
      });
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
      console.log('✅ Phaser game instance created');
      try {
        const canvasEl = (gameRef.current as any).canvas as HTMLCanvasElement | undefined;
        if (canvasEl) {
          canvasEl.addEventListener('webglcontextlost', (e) => {
            console.warn('⚠️ WebGL context lost — switching to Canvas', e);
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
            console.warn('ℹ️ WebGL context restored', e);
          }, false);
        }
        console.log('📝 Environment:', {
          ua: navigator.userAgent,
          dpr: window.devicePixelRatio,
          size: { w: window.innerWidth, h: window.innerHeight }
        });
      } catch (e) {
        console.warn('Renderer diagnostics setup failed:', e);
      }
      
      console.log('🎬 Starting MainScene with terrain data...');
      gameRef.current.scene.start('MainScene', {
        terrainData,
        playerPosition: playerStartGrid,
        worldSnapshot
      });
      console.log('✅ MainScene started');

      console.log('🏁 Generation complete - hiding loading screen');
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
    } catch (e) {
      console.warn('Autosave on exit failed (continuing):', e);
    }
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
