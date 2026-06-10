import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import vertShader from './shaders/volume.vert.glsl';
import fragShader from './shaders/volume.frag.glsl';
import { volumeStore, type TFControlPoint } from '@/store/volumeStore';

export class VolumeScene {
  private renderer: THREE.WebGLRenderer;
  private orthoCamera: THREE.OrthographicCamera;
  private perspCamera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private scene: THREE.Scene;
  private material: THREE.ShaderMaterial;
  private volumeTexture: THREE.Data3DTexture | null = null;
  private tfTexture: THREE.DataTexture | null = null;
  private container: HTMLElement;
  private animFrameId: number | null = null;
  private _timeAccum = 0;
  private _clock: THREE.Clock;

  constructor(container: HTMLElement) {
    this.container = container;
    this._clock = new THREE.Clock();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setClearColor(0xffffff, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    const w = container.clientWidth;
    const h = Math.max(container.clientHeight, 1);
    const aspect = w / h;

    this.perspCamera = new THREE.PerspectiveCamera(45, aspect, 0.1, 10);
    this.perspCamera.position.set(1.5, 1.0, 2.0);
    this.perspCamera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.perspCamera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.update();

    this.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.material = new THREE.ShaderMaterial({
      vertexShader: vertShader,
      fragmentShader: fragShader,
      uniforms: {
        uVolume: { value: null },
        uTransferFunction: { value: null },
        uCameraPos: { value: new THREE.Vector3() },
        uInvViewMatrix: { value: new THREE.Matrix4() },
        uInvProjMatrix: { value: new THREE.Matrix4() },
        uResolution: { value: new THREE.Vector2(w, h) },
        uBoxMin: { value: new THREE.Vector3(-0.5, -0.5, -0.5) },
        uBoxMax: { value: new THREE.Vector3(0.5, 0.5, 0.5) },
        uStepSize: { value: 1.0 / 64 },
        uFilterMin: { value: -1.0 },
        uFilterMax: { value: -1.0 },
      },
      depthTest: false,
      depthWrite: false,
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    const quadMesh = new THREE.Mesh(geometry, this.material);

    this.scene = new THREE.Scene();
    this.scene.add(quadMesh);

    this.buildTFTexture(volumeStore.transferFunction);
    this.startLoop();
  }

  loadVolumeData(data: Float32Array): void {
    if (this.volumeTexture) {
      this.volumeTexture.dispose();
    }

    const texture = new THREE.Data3DTexture(data, 128, 128, 128);
    texture.format = THREE.RedFormat;
    texture.type = THREE.FloatType;
    texture.internalFormat = 'R32F';
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.wrapR = THREE.ClampToEdgeWrapping;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;

    this.volumeTexture = texture;
    this.material.uniforms.uVolume.value = texture;
  }

  buildTFTexture(controlPoints: TFControlPoint[]): void {
    if (this.tfTexture) {
      this.tfTexture.dispose();
    }

    const res = 256;
    const pixels = new Uint8Array(res * 4);

    for (let i = 0; i < res; i++) {
      const t = i / (res - 1);
      const c = this.evaluateTF(controlPoints, t);
      const idx = i * 4;
      pixels[idx] = Math.round(c.r * 255);
      pixels[idx + 1] = Math.round(c.g * 255);
      pixels[idx + 2] = Math.round(c.b * 255);
      pixels[idx + 3] = Math.round(c.a * 255);
    }

    const texture = new THREE.DataTexture(pixels, res, 1, THREE.RGBAFormat);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;

    this.tfTexture = texture;
    this.material.uniforms.uTransferFunction.value = texture;
  }

  private evaluateTF(
    points: TFControlPoint[],
    t: number
  ): { r: number; g: number; b: number; a: number } {
    if (points.length === 0) return { r: 0, g: 0, b: 0, a: 0 };
    if (t <= points[0].position) {
      return {
        r: points[0].color[0],
        g: points[0].color[1],
        b: points[0].color[2],
        a: points[0].opacity,
      };
    }
    const last = points[points.length - 1];
    if (t >= last.position) {
      return { r: last.color[0], g: last.color[1], b: last.color[2], a: last.opacity };
    }

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      if (t >= p0.position && t <= p1.position) {
        const frac = (t - p0.position) / (p1.position - p0.position);
        return {
          r: p0.color[0] + (p1.color[0] - p0.color[0]) * frac,
          g: p0.color[1] + (p1.color[1] - p0.color[1]) * frac,
          b: p0.color[2] + (p1.color[2] - p0.color[2]) * frac,
          a: p0.opacity + (p1.opacity - p0.opacity) * frac,
        };
      }
    }

    return { r: last.color[0], g: last.color[1], b: last.color[2], a: last.opacity };
  }

  updateFilterRange(range: { min: number; max: number } | null, dataRange?: { min: number; max: number }): void {
    if (range && dataRange) {
      const dMin = dataRange.min, dMax = dataRange.max;
      const dSpan = dMax - dMin || 1;
      this.material.uniforms.uFilterMin.value = (range.min - dMin) / dSpan;
      this.material.uniforms.uFilterMax.value = (range.max - dMin) / dSpan;
    } else {
      this.material.uniforms.uFilterMin.value = -1.0;
      this.material.uniforms.uFilterMax.value = -1.0;
    }
  }

  updateStepSize(stepSize: number): void {
    this.material.uniforms.uStepSize.value = stepSize;
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height);
    const aspect = width / Math.max(height, 1);
    this.perspCamera.aspect = aspect;
    this.perspCamera.updateProjectionMatrix();
    this.material.uniforms.uResolution.value.set(width, height);
  }

  private startLoop(): void {
    const animate = (): void => {
      this.animFrameId = requestAnimationFrame(animate);
      this.controls.update();

      if (volumeStore.isPlaying) {
        const delta = this._clock.getDelta();
        this._timeAccum += delta;
        const stepDuration = 1.0 / volumeStore.playSpeed;
        if (this._timeAccum >= stepDuration) {
          this._timeAccum -= stepDuration;
          volumeStore.advanceStep(1);
        }
      }

      this.material.uniforms.uCameraPos.value.copy(this.perspCamera.position);
      this.material.uniforms.uInvViewMatrix.value.copy(this.perspCamera.matrixWorld);
      this.material.uniforms.uInvProjMatrix.value.copy(
        this.perspCamera.projectionMatrixInverse
      );

      this.renderer.render(this.scene, this.orthoCamera);
    };

    animate();
  }

  dispose(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
    }
    this.controls.dispose();
    this.renderer.dispose();
    if (this.volumeTexture) this.volumeTexture.dispose();
    if (this.tfTexture) this.tfTexture.dispose();
    this.material.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
