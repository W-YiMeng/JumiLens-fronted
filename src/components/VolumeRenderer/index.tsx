import React, { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import './index.less';

interface VolumeRendererProps {
  data: Float32Array;
  dimensions: { x: number; y: number; z: number };
  minDensity: number;
  maxDensity: number;
  transferFunction: TransferFunctionPoint[];
  timestep: number;
  highlightedRange?: { min: number; max: number } | null;
}

export interface TransferFunctionPoint {
  position: number;
  color: [number, number, number];
  alpha: number;
}

const defaultTransferFunction: TransferFunctionPoint[] = [
  { position: 0.0, color: [0.0, 0.0, 0.2], alpha: 0.0 },
  { position: 0.2, color: [0.0, 0.0, 0.5], alpha: 0.1 },
  { position: 0.4, color: [0.2, 0.0, 0.6], alpha: 0.3 },
  { position: 0.6, color: [0.8, 0.2, 0.0], alpha: 0.6 },
  { position: 0.8, color: [1.0, 0.6, 0.0], alpha: 0.8 },
  { position: 1.0, color: [1.0, 1.0, 1.0], alpha: 1.0 },
];

const VolumeRenderer: React.FC<VolumeRendererProps> = ({
  data,
  dimensions,
  minDensity,
  maxDensity,
  transferFunction = defaultTransferFunction,
  timestep,
  highlightedRange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const volumeTextureRef = useRef<THREE.Data3DTexture | null>(null);
  const transferTextureRef = useRef<THREE.DataTexture | null>(null);
  const animationRef = useRef<number>(0);
  const isDraggingRef = useRef(false);
  const previousMousePositionRef = useRef({ x: 0, y: 0 });
  const cameraPositionRef = useRef({ theta: Math.PI / 4, phi: Math.PI / 3, radius: 2.5 });

  const vertexShader = `
    varying vec3 vWorldPosition;
    
    void main() {
      vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    precision highp float;
    precision highp sampler3D;
    
    uniform sampler3D volumeData;
    uniform sampler2D transferFunction;
    uniform vec3 volumeDimensions;
    uniform float minDensity;
    uniform float maxDensity;
    uniform float brightness;
    uniform int maxSteps;
    uniform float stepSize;
    uniform vec2 highlightRange;
    uniform float highlightIntensity;
    uniform vec3 cameraPos;
    
    varying vec3 vWorldPosition;
    
    vec4 sampleTransferFunction(float value) {
      return texture(transferFunction, vec2(clamp(value, 0.0, 1.0), 0.5));
    }
    
    float sampleVolume(vec3 position) {
      return texture(volumeData, position).r;
    }
    
    // 计算射线与边界框的交点
    vec2 intersectBox(vec3 origin, vec3 dir, vec3 boxMin, vec3 boxMax) {
      vec3 invDir = 1.0 / dir;
      vec3 tMin = (boxMin - origin) * invDir;
      vec3 tMax = (boxMax - origin) * invDir;
      vec3 t1 = min(tMin, tMax);
      vec3 t2 = max(tMin, tMax);
      float tNear = max(max(t1.x, t1.y), t1.z);
      float tFar = min(min(t2.x, t2.y), t2.z);
      return vec2(tNear, tFar);
    }
    
    void main() {
      // 边界框 (0,0,0) 到 (1,1,1)
      vec3 boxMin = vec3(0.0);
      vec3 boxMax = vec3(1.0);
      
      // 计算射线方向和起点
      vec3 rayDir = normalize(vWorldPosition - cameraPos);
      vec3 rayOrigin = cameraPos;
      
      // 射线与边界框相交测试
      vec2 intersection = intersectBox(rayOrigin, rayDir, boxMin, boxMax);
      float tNear = intersection.x;
      float tFar = intersection.y;
      
      if (tNear > tFar || tFar < 0.0) {
        discard;
      }
      
      tNear = max(tNear, 0.0);
      
      // 体渲染积分
      vec4 accumulatedColor = vec4(0.0);
      float t = tNear;
      int steps = 0;
      
      while (t < tFar && steps < maxSteps) {
        vec3 position = rayOrigin + t * rayDir;
        
        // 确保位置在边界框内
        position = clamp(position, boxMin + 0.001, boxMax - 0.001);
        
        float density = sampleVolume(position);
        float normalizedDensity = (density - minDensity) / (maxDensity - minDensity);
        normalizedDensity = clamp(normalizedDensity, 0.0, 1.0);
        
        // 高亮特定范围
        float highlight = 0.0;
        if (highlightRange.x < highlightRange.y) {
          float rangeCenter = (highlightRange.x + highlightRange.y) * 0.5;
          float rangeWidth = (highlightRange.y - highlightRange.x) * 0.5;
          float dist = abs(normalizedDensity - rangeCenter);
          if (dist < rangeWidth) {
            highlight = (1.0 - dist / rangeWidth) * highlightIntensity;
          }
        }
        
        vec4 tfColor = sampleTransferFunction(normalizedDensity);
        tfColor.rgb += vec3(highlight);
        
        float alpha = tfColor.a * stepSize * brightness;
        accumulatedColor.rgb += (1.0 - accumulatedColor.a) * tfColor.rgb * alpha;
        accumulatedColor.a += (1.0 - accumulatedColor.a) * alpha;
        
        if (accumulatedColor.a >= 0.99) {
          break;
        }
        
        t += stepSize;
        steps++;
      }
      
      gl_FragColor = accumulatedColor;
    }
  `;

  const createTransferTexture = useCallback((tf: TransferFunctionPoint[]) => {
    const size = 256;
    const data = new Uint8Array(size * 4);
    const sorted = [...tf].sort((a, b) => a.position - b.position);
    
    for (let i = 0; i < size; i++) {
      const t = i / (size - 1);
      let lower = sorted[0];
      let upper = sorted[sorted.length - 1];
      
      for (let j = 0; j < sorted.length - 1; j++) {
        if (t >= sorted[j].position && t <= sorted[j + 1].position) {
          lower = sorted[j];
          upper = sorted[j + 1];
          break;
        }
      }
      
      let alpha: number;
      let color: [number, number, number];
      
      if (lower === upper || upper.position === lower.position) {
        alpha = lower.alpha;
        color = lower.color;
      } else {
        const localT = (t - lower.position) / (upper.position - lower.position);
        alpha = lower.alpha + (upper.alpha - lower.alpha) * localT;
        color = [
          lower.color[0] + (upper.color[0] - lower.color[0]) * localT,
          lower.color[1] + (upper.color[1] - lower.color[1]) * localT,
          lower.color[2] + (upper.color[2] - lower.color[2]) * localT,
        ];
      }
      
      data[i * 4] = Math.floor(color[0] * 255);
      data[i * 4 + 1] = Math.floor(color[1] * 255);
      data[i * 4 + 2] = Math.floor(color[2] * 255);
      data[i * 4 + 3] = Math.floor(alpha * 255);
    }
    
    const texture = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    return texture;
  }, []);

  // 创建体数据纹理 - 正确处理数据顺序
  // Nyx数据: reshape((128,128,128)) 后使用 data[z,y,x]
  // 内存布局: index = x*128*128 + y*128 + z (因为numpy默认是C-order，即行优先)
  // 但之前说列优先 index = z + 128*(y + 128*x)，这意味着x变化最快
  // Three.js Data3DTexture: index = x + width*(y + height*z)，x变化最快
  // 所以实际上数据顺序是一致的！
  const createVolumeTexture = useCallback((volumeData: Float32Array, dims: { x: number; y: number; z: number }) => {
    const texture = new THREE.Data3DTexture(volumeData, dims.x, dims.y, dims.z);
    texture.format = THREE.RedFormat;
    texture.type = THREE.FloatType;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.wrapR = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    return texture;
  }, []);

  const updateCameraPosition = useCallback(() => {
    if (!cameraRef.current) return;
    
    const { theta, phi, radius } = cameraPositionRef.current;
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.sin(theta);
    
    cameraRef.current.position.set(x, y, z);
    cameraRef.current.lookAt(0.5, 0.5, 0.5);
    
    if (materialRef.current) {
      materialRef.current.uniforms.cameraPos.value = cameraRef.current.position;
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // 场景
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // 相机 - 使用正交投影确保立方体大小固定
    const aspect = width / height;
    const frustumSize = 2.5;
    const camera = new THREE.OrthographicCamera(
      -frustumSize * aspect / 2,
      frustumSize * aspect / 2,
      frustumSize / 2,
      -frustumSize / 2,
      0.1,
      1000
    );
    cameraRef.current = camera;

    // 渲染器
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 创建立方体 - 大小为1x1x1，中心在原点
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    
    // 默认传递函数
    const defaultTfTexture = createTransferTexture(defaultTransferFunction);
    transferTextureRef.current = defaultTfTexture;

    // 材质
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        volumeData: { value: null },
        transferFunction: { value: defaultTfTexture },
        volumeDimensions: { value: new THREE.Vector3(dimensions.x, dimensions.y, dimensions.z) },
        minDensity: { value: 0 },
        maxDensity: { value: 1 },
        brightness: { value: 2.0 },
        maxSteps: { value: 128 },
        stepSize: { value: 0.008 },
        highlightRange: { value: new THREE.Vector2(0, 0) },
        highlightIntensity: { value: 0.5 },
        cameraPos: { value: new THREE.Vector3() },
      },
      side: THREE.BackSide,
      transparent: true,
    });
    materialRef.current = material;

    const mesh = new THREE.Mesh(geometry, material);
    // 立方体顶点范围是 -0.5 到 0.5，将其移动到 0 到 1
    mesh.position.set(0.5, 0.5, 0.5);
    scene.add(mesh);

    // 初始相机位置
    updateCameraPosition();

    // 鼠标事件
    const handleMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
      container.style.cursor = 'grabbing';
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;

      const deltaX = e.clientX - previousMousePositionRef.current.x;
      const deltaY = e.clientY - previousMousePositionRef.current.y;

      cameraPositionRef.current.theta -= deltaX * 0.01;
      cameraPositionRef.current.phi += deltaY * 0.01;
      
      // 限制phi范围，避免相机翻转
      cameraPositionRef.current.phi = Math.max(0.1, Math.min(Math.PI - 0.1, cameraPositionRef.current.phi));

      updateCameraPosition();

      previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      container.style.cursor = 'grab';
    };

    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('mouseenter', () => { container.style.cursor = 'grab'; });
    container.addEventListener('mouseleave', () => { 
      isDraggingRef.current = false;
      container.style.cursor = 'default'; 
    });

    // 动画循环
    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // 窗口大小变化
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;
      const newAspect = newWidth / newHeight;
      const newFrustumSize = 2.5;
      cameraRef.current.left = -newFrustumSize * newAspect / 2;
      cameraRef.current.right = newFrustumSize * newAspect / 2;
      cameraRef.current.top = newFrustumSize / 2;
      cameraRef.current.bottom = -newFrustumSize / 2;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(newWidth, newHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      cancelAnimationFrame(animationRef.current);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [dimensions, createTransferTexture, createVolumeTexture, updateCameraPosition]);

  // 更新体数据
  useEffect(() => {
    if (!materialRef.current || !data) return;

    if (volumeTextureRef.current) {
      volumeTextureRef.current.dispose();
    }
    volumeTextureRef.current = createVolumeTexture(data, dimensions);

    materialRef.current.uniforms.volumeData.value = volumeTextureRef.current;
    materialRef.current.uniforms.volumeDimensions.value = new THREE.Vector3(
      dimensions.x,
      dimensions.y,
      dimensions.z
    );
    materialRef.current.uniforms.minDensity.value = minDensity;
    materialRef.current.uniforms.maxDensity.value = maxDensity;
  }, [data, dimensions, minDensity, maxDensity, createVolumeTexture]);

  // 更新传递函数
  useEffect(() => {
    if (!materialRef.current) return;

    if (transferTextureRef.current) {
      transferTextureRef.current.dispose();
    }
    transferTextureRef.current = createTransferTexture(transferFunction);

    materialRef.current.uniforms.transferFunction.value = transferTextureRef.current;
  }, [transferFunction, createTransferTexture]);

  // 更新高亮范围
  useEffect(() => {
    if (!materialRef.current) return;

    if (highlightedRange) {
      const normalizedMin = (highlightedRange.min - minDensity) / (maxDensity - minDensity);
      const normalizedMax = (highlightedRange.max - minDensity) / (maxDensity - minDensity);
      materialRef.current.uniforms.highlightRange.value = new THREE.Vector2(normalizedMin, normalizedMax);
      materialRef.current.uniforms.highlightIntensity.value = 0.8;
    } else {
      materialRef.current.uniforms.highlightRange.value = new THREE.Vector2(0, 0);
      materialRef.current.uniforms.highlightIntensity.value = 0;
    }
  }, [highlightedRange, minDensity, maxDensity]);

  return (
    <div ref={containerRef} className="volume-renderer">
      <div className="volume-info">
        <span>时间步: {timestep}</span>
        <span>密度范围: [{minDensity.toExponential(2)}, {maxDensity.toExponential(2)}]</span>
      </div>
    </div>
  );
};

export default VolumeRenderer;
