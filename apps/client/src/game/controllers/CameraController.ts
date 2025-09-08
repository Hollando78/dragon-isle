import Phaser from 'phaser';
import { clamp, lerp, WORLD_SIZE, TILE_SIZE } from '@dragon-isle/shared';
import type { Player } from '../entities/Player';

export class CameraController {
  private scene: Phaser.Scene;
  private camera: Phaser.Cameras.Scene2D.Camera;
  private player: Player;
  private targetZoom = 1;
  private currentZoom = 1;
  private minZoom = 0.5;
  private maxZoom = 2;
  private zoomSpeed = 0.1;
  private followSpeed = 0.1;
  private isDragging = false;
  private dragStart: { x: number; y: number } | null = null;
  private cameraStart: { x: number; y: number } | null = null;

  constructor(scene: Phaser.Scene, player: Player) {
    this.scene = scene;
    this.camera = scene.cameras.main;
    this.player = player;
    
    this.setupCamera();
    this.setupInputHandlers();
  }

  private setupCamera() {
    console.log('🎥 Setting up camera...');
    console.log('🎥 Player sprite position:', { x: this.player.sprite.x, y: this.player.sprite.y });
    
    // Center camera on player immediately
    this.camera.centerOn(this.player.sprite.x, this.player.sprite.y);
    console.log('🎥 Camera centered on player');
    
    // Then start following
    this.camera.startFollow(this.player.sprite, true, this.followSpeed, this.followSpeed);
    this.camera.setZoom(this.currentZoom);
    
    // Set larger bounds to accommodate isometric world
    const worldSize = WORLD_SIZE * TILE_SIZE; // Grid size * tile size  
    this.camera.setBounds(-worldSize, -worldSize, worldSize * 2, worldSize * 2);
    console.log('🎥 Camera bounds set:', { width: worldSize * 2, height: worldSize * 2 });
  }

  private setupInputHandlers() {
    if (!this.scene.input.keyboard) return;
    
    const cursors = this.scene.input.keyboard.createCursorKeys();
    
    this.scene.input.on('wheel', (pointer: Phaser.Input.Pointer, gameObjects: any[], deltaX: number, deltaY: number) => {
      const zoomDelta = deltaY > 0 ? -0.1 : 0.1;
      this.targetZoom = clamp(this.targetZoom + zoomDelta, this.minZoom, this.maxZoom);
    });
    
    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown() || pointer.button === 2) {
        this.isDragging = true;
        this.dragStart = { x: pointer.x, y: pointer.y };
        this.cameraStart = { x: this.camera.scrollX, y: this.camera.scrollY };
        this.camera.stopFollow();
      }
    });
    
    this.scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.rightButtonDown() && pointer.button !== 2) {
        this.isDragging = false;
        this.dragStart = null;
        this.cameraStart = null;
        this.camera.startFollow(this.player.sprite, false, this.followSpeed, this.followSpeed);
      }
    });
    
    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.isDragging && this.dragStart && this.cameraStart) {
        const dragX = (this.dragStart.x - pointer.x) / this.currentZoom;
        const dragY = (this.dragStart.y - pointer.y) / this.currentZoom;
        
        this.camera.setScroll(
          this.cameraStart.x + dragX,
          this.cameraStart.y + dragY
        );
      }
    });
    
    const pinchDistance = { start: 0, current: 0 };
    
    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.scene.input.pointer2 && this.scene.input.pointer2.isDown) {
        const p1 = this.scene.input.pointer1;
        const p2 = this.scene.input.pointer2;
        pinchDistance.start = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        pinchDistance.current = pinchDistance.start;
      }
    });
    
    this.scene.input.on('pointermove', () => {
      if (this.scene.input.pointer1.isDown && this.scene.input.pointer2 && this.scene.input.pointer2.isDown) {
        const p1 = this.scene.input.pointer1;
        const p2 = this.scene.input.pointer2;
        const currentDistance = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        
        if (pinchDistance.start > 0) {
          const zoomDelta = (currentDistance - pinchDistance.current) * 0.01;
          this.targetZoom = clamp(this.targetZoom + zoomDelta, this.minZoom, this.maxZoom);
          pinchDistance.current = currentDistance;
        }
      }
    });
  }

  update(delta: number) {
    this.currentZoom = lerp(this.currentZoom, this.targetZoom, this.zoomSpeed);
    this.camera.setZoom(this.currentZoom);
  }

  setZoom(zoom: number) {
    this.targetZoom = clamp(zoom, this.minZoom, this.maxZoom);
  }

  shake(duration = 100, intensity = 5) {
    this.camera.shake(duration, intensity * 0.01);
  }

  flash(duration = 100, r = 255, g = 255, b = 255) {
    this.camera.flash(duration, r, g, b);
  }

  fade(duration = 500, r = 0, g = 0, b = 0) {
    this.camera.fade(duration, r, g, b);
  }
}