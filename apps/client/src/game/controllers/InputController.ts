import Phaser from 'phaser';
import { worldToGrid, gridToWorld, TILE_SIZE } from '@dragon-isle/shared';
import type { Player } from '../entities/Player';
import type { CameraController } from './CameraController';

export class InputController {
  private scene: Phaser.Scene;
  private player: Player;
  private cameraController: CameraController;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: { [key: string]: Phaser.Input.Keyboard.Key };
  private touchControls: {
    isMoving: boolean;
    target: { x: number; y: number } | null;
    joystick: { x: number; y: number };
  };
  private lastTap = 0;
  private tapDelay = 300;
  private isMobile = false;

  // Virtual joystick (mobile only)
  private joystickActive = false;
  private joystickPointerId: number | null = null;
  private joystickBasePos: { x: number; y: number } = { x: 0, y: 0 };
  private joystickRadius = 60;
  private joystickDeadzone = 0.1;
  private joystickBase?: Phaser.GameObjects.Circle;
  private joystickKnob?: Phaser.GameObjects.Circle;

  constructor(scene: Phaser.Scene, player: Player, cameraController: CameraController) {
    this.scene = scene;
    this.player = player;
    this.cameraController = cameraController;
    
    this.touchControls = {
      isMoving: false,
      target: null,
      joystick: { x: 0, y: 0 }
    };
    
    this.isMobile = typeof window !== 'undefined'
      ? (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
      : false;

    this.setupKeyboardControls();
    if (this.isMobile) {
      this.setupVirtualJoystick();
    } else {
      this.setupTouchControls();
    }
  }

  private setupKeyboardControls() {
    const dbg = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');
    if (dbg) {
      // eslint-disable-next-line no-console
      console.log('🎮 Setting up keyboard controls...');
    }
    if (!this.scene.input.keyboard) {
      if (dbg) {
        // eslint-disable-next-line no-console
        console.error('❌ No keyboard input available');
      }
      return;
    }
    
    this.cursors = this.scene.input.keyboard.createCursorKeys();
    this.wasd = {
      w: this.scene.input.keyboard.addKey('W'),
      a: this.scene.input.keyboard.addKey('A'),
      s: this.scene.input.keyboard.addKey('S'),
      d: this.scene.input.keyboard.addKey('D'),
      shift: this.scene.input.keyboard.addKey('SHIFT'),
      space: this.scene.input.keyboard.addKey('SPACE')
    };
    if (dbg) {
      // eslint-disable-next-line no-console
      console.log('✅ Keyboard controls setup complete');
      // eslint-disable-next-line no-console
      console.log('🎮 Controls: Arrow keys/WASD to move, Shift to run, Space to interact');
    }
  }

  private setupTouchControls() {
    // Desktop (non-mobile) touch/mouse controls: tap/click-to-move
    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) {
        const currentTime = Date.now();
        if (currentTime - this.lastTap < this.tapDelay) {
          this.handleDoubleTap(pointer);
        } else {
          this.handleTap(pointer);
        }
        this.lastTap = currentTime;
      }
    });
    this.scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonReleased()) {
        this.touchControls.isMoving = false;
        this.touchControls.target = null;
      }
    });
    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown && pointer.leftButtonDown()) {
        this.updateTouchMovement(pointer);
      }
    });
  }

  private setupVirtualJoystick() {
    // Create joystick visuals (screen space, not affected by camera scroll)
    this.joystickBase = this.scene.add.circle(0, 0, this.joystickRadius, 0x000000, 0.25)
      .setScrollFactor(0)
      .setDepth(99999)
      .setVisible(false);
    this.joystickBase.setStrokeStyle(2, 0xffffff, 0.6);

    this.joystickKnob = this.scene.add.circle(0, 0, this.joystickRadius / 2, 0x4a9eff, 0.6)
      .setScrollFactor(0)
      .setDepth(100000)
      .setVisible(false);
    this.joystickKnob.setStrokeStyle(2, 0x2966a3, 1);

    // Touch start: activate joystick at touch point
    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // Only consider primary touch for joystick; allow second pointer for pinch in CameraController
      if (!this.joystickActive) {
        this.joystickActive = true;
        this.joystickPointerId = pointer.id;
        this.joystickBasePos = { x: pointer.x, y: pointer.y };
        this.touchControls.joystick = { x: 0, y: 0 };

        this.joystickBase!.setPosition(pointer.x, pointer.y).setVisible(true);
        this.joystickKnob!.setPosition(pointer.x, pointer.y).setVisible(true);
      }
    });

    // Touch move: update joystick vector when active
    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.joystickActive || this.joystickPointerId !== pointer.id) return;
      const dx = pointer.x - this.joystickBasePos.x;
      const dy = pointer.y - this.joystickBasePos.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const max = this.joystickRadius;

      let nx = 0, ny = 0;
      if (len > 0) {
        const clamped = Math.min(len, max);
        nx = (dx / len) * (clamped / max);
        ny = (dy / len) * (clamped / max);
      }

      // Deadzone
      const mag = Math.sqrt(nx * nx + ny * ny);
      if (mag < this.joystickDeadzone) {
        this.touchControls.joystick = { x: 0, y: 0 };
        this.joystickKnob!.setPosition(this.joystickBasePos.x, this.joystickBasePos.y);
      } else {
        this.touchControls.joystick = { x: nx, y: ny };
        this.joystickKnob!.setPosition(
          this.joystickBasePos.x + nx * this.joystickRadius,
          this.joystickBasePos.y + ny * this.joystickRadius
        );
      }
    });

    // Touch end: deactivate joystick
    this.scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.joystickActive && this.joystickPointerId === pointer.id) {
        this.joystickActive = false;
        this.joystickPointerId = null;
        this.touchControls.joystick = { x: 0, y: 0 };
        this.joystickBase!.setVisible(false);
        this.joystickKnob!.setVisible(false);
      }
    });
  }

  private handleTap(pointer: Phaser.Input.Pointer) {
    const worldPoint = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    
    const mainScene = this.scene as any;
    if (mainScene.isWalkable && !mainScene.isWalkable(worldPoint.x, worldPoint.y)) {
      return;
    }
    
    this.touchControls.isMoving = true;
    this.touchControls.target = { x: worldPoint.x, y: worldPoint.y };
  }

  private handleDoubleTap(pointer: Phaser.Input.Pointer) {
    const zoomIn = this.cameraController as any;
    if (zoomIn.targetZoom < 1.5) {
      zoomIn.setZoom(2);
    } else {
      zoomIn.setZoom(1);
    }
  }

  private updateTouchMovement(pointer: Phaser.Input.Pointer) {
    if (!this.touchControls.isMoving) {
      this.touchControls.isMoving = true;
    }
    
    const worldPoint = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.touchControls.target = { x: worldPoint.x, y: worldPoint.y };
  }

  update(delta: number) {
    let moveX = 0;
    let moveY = 0;
    let isRunning = false;
    let inputDetected = false;
    
    // Check keyboard input (desktop only)
    if (!this.isMobile && this.cursors && this.wasd) {
      const leftPressed = this.cursors.left.isDown || this.wasd.a.isDown;
      const rightPressed = this.cursors.right.isDown || this.wasd.d.isDown;
      const upPressed = this.cursors.up.isDown || this.wasd.w.isDown;
      const downPressed = this.cursors.down.isDown || this.wasd.s.isDown;
      const shiftPressed = this.wasd.shift.isDown;
      const spacePressed = this.wasd.space.isDown;
      
      if (leftPressed || rightPressed || upPressed || downPressed || shiftPressed || spacePressed) {
        if (!inputDetected) {
          const dbg = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');
          if (dbg) {
            // eslint-disable-next-line no-console
            console.log('🎮 Input detected:', {
              left: leftPressed,
              right: rightPressed, 
              up: upPressed,
              down: downPressed,
              shift: shiftPressed,
              space: spacePressed
            });
          }
          inputDetected = true;
        }
      }
      
      if (leftPressed) moveX -= 1;
      if (rightPressed) moveX += 1;
      if (upPressed) moveY -= 1;
      if (downPressed) moveY += 1;
      
      isRunning = shiftPressed;
    } else {
      const dbg = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');
      if (dbg) {
        // eslint-disable-next-line no-console
        console.warn('⚠️ No keyboard controls available');
      }
    }
    
    // Touch/mouse input (desktop click-to-move only)
    if (!this.isMobile) {
      if (this.touchControls.isMoving && this.touchControls.target) {
        const dx = this.touchControls.target.x - this.player.sprite.x;
        const dy = this.touchControls.target.y - this.player.sprite.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 5) {
          moveX = dx / distance;
          moveY = dy / distance;
          if (!inputDetected) {
            const dbg = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');
            if (dbg) {
              // eslint-disable-next-line no-console
              console.log('🖱️ Touch/mouse movement:', { moveX, moveY, distance });
            }
          }
        } else {
          this.touchControls.isMoving = false;
          this.touchControls.target = null;
        }
      }
    }
    
    // Virtual joystick input (mobile only)
    if (this.isMobile && (this.touchControls.joystick.x !== 0 || this.touchControls.joystick.y !== 0)) {
      moveX = this.touchControls.joystick.x;
      moveY = this.touchControls.joystick.y;
      if (!inputDetected) {
        const dbg = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');
        if (dbg) {
          // eslint-disable-next-line no-console
          console.log('🕹️ Joystick input:', { moveX, moveY });
        }
      }
    }
    
    // Apply movement
    if (moveX !== 0 || moveY !== 0) {
      const dbg = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');
      if (dbg) {
        // eslint-disable-next-line no-console
        console.log('🏃 Attempting to move player:', { moveX, moveY, isRunning, playerPos: { x: this.player.sprite.x, y: this.player.sprite.y } });
      }
      this.player.move(moveX, moveY, isRunning);
    } else {
      this.player.stop();
    }
    
    // Handle interaction
    if (!this.isMobile && this.wasd?.space.isDown) {
      if (!inputDetected) {
        const dbg2 = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');
        if (dbg2) {
          // eslint-disable-next-line no-console
          console.log('💫 Player interact triggered');
        }
      }
      this.player.interact();
    }
  }

  setJoystickInput(x: number, y: number) {
    this.touchControls.joystick = { x, y };
  }

  clearInput() {
    this.touchControls = {
      isMoving: false,
      target: null,
      joystick: { x: 0, y: 0 }
    };
  }
}
