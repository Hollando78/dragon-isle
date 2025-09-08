import Phaser from 'phaser';
import { clamp, normalize, worldToIsometric, worldToGrid, gridToWorld, TILE_SIZE } from '@dragon-isle/shared';
import { ensureWalkingManTexture } from '../assets/walkingMan';
import { useGameStore } from '../../state/gameStore';

export class Player {
  public sprite: Phaser.GameObjects.Sprite;
  private scene: Phaser.Scene;
  private velocity: { x: number; y: number };
  private baseSpeed = 150;
  private runSpeed = 250;
  private currentSpeed: number;
  private isMoving = false;
  private footstepTimer = 0;
  private footstepInterval = 300;
  private shadow: Phaser.GameObjects.Ellipse;
  private nameText: Phaser.GameObjects.Text;
  private tileHighlight: Phaser.GameObjects.Rectangle;
  private lastStoreSync = 0;
  private storeSyncInterval = 150; // ms

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.velocity = { x: 0, y: 0 };
    this.currentSpeed = this.baseSpeed;
    
    // Create tile highlight first (so it appears below everything)
    const gridPos = worldToGrid({ x, y }, TILE_SIZE);
    // Use gridToWorld to get the same positioning logic as player spawn
    const highlightPos = gridToWorld(gridPos, TILE_SIZE);
    this.tileHighlight = scene.add.rectangle(
      highlightPos.x,
      highlightPos.y,
      TILE_SIZE,
      TILE_SIZE,
      0xffff00,
      0.3
    );
    this.tileHighlight.setStrokeStyle(2, 0xffff00, 0.8);

    this.shadow = scene.add.ellipse(x, y + 8, 20, 10, 0x000000, 0.3);

    // Ensure procedural walking man textures/animation exist
    ensureWalkingManTexture(scene);
    // Create player sprite using walking man frame 0
    this.sprite = scene.add.sprite(x, y, 'walkman-0');
    this.sprite.setOrigin(0.5, 0.8);

    // Place name label below the character so it doesn't overlap the face
    this.nameText = scene.add.text(x, y + 18, 'Player', {
      fontSize: '12px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2
    });
    this.nameText.setOrigin(0.5);
    
    // Ensure initial depths match the same formula used during updates
    const initialDepth = Math.floor(y * 10 + x * 0.1);
    this.sprite.setDepth(initialDepth);
    this.shadow.setDepth(initialDepth - 1);
    this.nameText.setDepth(initialDepth + 1);
    this.tileHighlight.setDepth(initialDepth - 2);
    
    this.setupAnimations();
  }

  private setupAnimations() {
    // Disabled bobbing animation as it interferes with player movement
    // const bobAmount = 2;
    // const bobSpeed = 100;
    
    // this.scene.tweens.add({
    //   targets: this.sprite,
    //   y: this.sprite.y - bobAmount,
    //   duration: bobSpeed,
    //   yoyo: true,
    //   repeat: -1,
    //   ease: 'Sine.easeInOut'
    // });
  }

  move(x: number, y: number, isRunning = false) {
    const dbg = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');
    if (dbg) {
      // eslint-disable-next-line no-console
      console.log('👤 Player.move() called:', { x, y, isRunning, currentPos: { x: this.sprite.x, y: this.sprite.y } });
    }
    const normalized = normalize({ x, y });
    if (dbg) {
      // eslint-disable-next-line no-console
      console.log('👤 Movement normalization:', { 
        input: { x, y }, 
        inputLength: Math.sqrt(x*x + y*y), 
        normalized, 
        normalizedLength: Math.sqrt(normalized.x*normalized.x + normalized.y*normalized.y) 
      });
    }
    this.velocity = normalized;
    this.currentSpeed = isRunning ? this.runSpeed : this.baseSpeed;
    this.isMoving = true;
    if (dbg) {
      // eslint-disable-next-line no-console
      console.log('👤 Player velocity set:', { velocity: this.velocity, speed: this.currentSpeed, isMoving: this.isMoving });
    }
  }

  stop() {
    this.velocity = { x: 0, y: 0 };
    this.isMoving = false;
  }

  update(delta: number) {
    if (this.isMoving) {
      const moveDistance = (this.currentSpeed * delta) / 1000;
      const newX = this.sprite.x + this.velocity.x * moveDistance;
      const newY = this.sprite.y + this.velocity.y * moveDistance;
      
      const dbg = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');
      if (dbg) {
        // eslint-disable-next-line no-console
        console.log('👤 Player.update() moving:', { 
          delta, 
          moveDistance, 
          velocity: this.velocity, 
          currentPos: { x: this.sprite.x, y: this.sprite.y },
          newPos: { x: newX, y: newY }
        });
      }
      
      const mainScene = this.scene as any;
      // Check walkability at player's center position (circle center)
      const canWalk = mainScene.isWalkable ? mainScene.isWalkable(newX, newY) : true;
      if (dbg) {
        // eslint-disable-next-line no-console
        console.log('👤 Walkability check for movement:', { 
          from: { x: this.sprite.x, y: this.sprite.y }, 
          to: { x: newX, y: newY },
          canWalk,
          moveVector: { x: this.velocity.x, y: this.velocity.y }
        });
      }
      
      if (canWalk) {
        this.sprite.x = newX;
        this.sprite.y = newY;

        // Ensure walking animation plays while moving
        if (!this.sprite.anims.isPlaying) {
          this.sprite.play('walkman-walk');
        }
        
        const depth = Math.floor(newY * 10 + newX * 0.1);
        this.sprite.setDepth(depth);
        this.shadow.setDepth(depth - 1);
        this.nameText.setDepth(depth + 1);
        this.tileHighlight.setDepth(depth - 2);
        
        this.shadow.x = newX;
        this.shadow.y = newY + 8;
        this.nameText.x = newX;
        this.nameText.y = newY + 18;
        
        // Update tile highlight position based on center position
        const gridPos = worldToGrid({ x: newX, y: newY }, TILE_SIZE);
        const highlightPos = gridToWorld(gridPos, TILE_SIZE);
        this.tileHighlight.x = highlightPos.x;
        this.tileHighlight.y = highlightPos.y;
        
        this.footstepTimer += delta;
        if (this.footstepTimer >= this.footstepInterval) {
          this.playFootstep();
          this.footstepTimer = 0;
        }
        if (dbg) {
          // eslint-disable-next-line no-console
          console.log('👤 Player position updated to:', { x: this.sprite.x, y: this.sprite.y });
        }
      } else {
        if (dbg) {
          // eslint-disable-next-line no-console
          console.warn('👤 Movement blocked by terrain check:', { newX, newY });
        }
      }
    }

    // Throttle syncing position to the store for UI (e.g., minimap)
    this.lastStoreSync += delta;
    if (this.lastStoreSync >= this.storeSyncInterval) {
      this.lastStoreSync = 0;
      const { setPlayerPosition } = useGameStore.getState();
      setPlayerPosition(this.sprite.x, this.sprite.y);
    }
  }

  private playFootstep() {
    const mainScene = this.scene as any;
    // Check terrain at player's center position
    const terrain = mainScene.getTerrainAt ? mainScene.getTerrainAt(this.sprite.x, this.sprite.y) : null;
    
    if (terrain) {
      const particle = this.scene.add.circle(
        this.sprite.x + Phaser.Math.Between(-5, 5),
        this.sprite.y + 16, // Below the circle
        2,
        0xcccccc,
        0.5
      );
      
      this.scene.tweens.add({
        targets: particle,
        alpha: 0,
        scale: 0.5,
        duration: 300,
        onComplete: () => particle.destroy()
      });
    }
  }

  interact() {
    const interactionRadius = 50;
    const interactionCircle = this.scene.add.circle(
      this.sprite.x,
      this.sprite.y,
      interactionRadius,
      0xffff00,
      0.2
    );
    
    this.scene.tweens.add({
      targets: interactionCircle,
      scale: 1.5,
      alpha: 0,
      duration: 200,
      onComplete: () => interactionCircle.destroy()
    });
    
    this.scene.events.emit('playerInteract', {
      x: this.sprite.x,
      y: this.sprite.y,
      radius: interactionRadius
    });
  }

  takeDamage(amount: number) {
    this.scene.cameras.main.shake(100, 0.005);
    this.sprite.setTintFill(0xff0000);
    
    this.scene.time.delayedCall(100, () => {
      this.sprite.clearTint();
      // keep default colors; no static tint on normal state
    });
  }

  heal(amount: number) {
    // Create healing particles effect
    for (let i = 0; i < 10; i++) {
      const particle = this.scene.add.circle(
        this.sprite.x + Phaser.Math.Between(-20, 20),
        this.sprite.y + Phaser.Math.Between(-20, 20),
        Phaser.Math.Between(2, 4),
        0x00ff00,
        0.7
      );
      
      this.scene.tweens.add({
        targets: particle,
        y: particle.y - 30,
        alpha: 0,
        scale: 0.5,
        duration: 800,
        delay: i * 50,
        onComplete: () => particle.destroy()
      });
    }
  }

  getPosition() {
    return { x: this.sprite.x, y: this.sprite.y };
  }

  setPosition(x: number, y: number) {
    this.sprite.x = x;
    this.sprite.y = y;
    this.shadow.x = x;
    this.shadow.y = y + 8;
    this.nameText.x = x;
    this.nameText.y = y + 18;
    
    // Update tile highlight position using center
    const gridPos = worldToGrid({ x, y }, TILE_SIZE);
    const highlightPos = gridToWorld(gridPos, TILE_SIZE);
    this.tileHighlight.x = highlightPos.x;
    this.tileHighlight.y = highlightPos.y;
    
    const depth = Math.floor(y * 10 + x * 0.1);
    this.sprite.setDepth(depth);
    this.shadow.setDepth(depth - 1);
    this.nameText.setDepth(depth + 1);
    this.tileHighlight.setDepth(depth - 2);

    // When not moving, ensure idle frame
    if (!this.isMoving) {
      this.sprite.anims.stop();
      this.sprite.setTexture('walkman-0');
    }
  }
}
