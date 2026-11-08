// ★ 组装点（docs/01-整体架构.md §3.2）：T01 最小可跑版——renderer + 空场景 + 清屏色循环。
// Engine 渲染循环/轨道相机/注册表状态/Director 装配分别为 T02/T03/T04/T17 落点，届时本文件重构为装配入口。
import * as THREE from 'three';
import { clamp } from '@/shared/math';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('index.html 缺少 #app 挂载点');
}

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(clamp(window.devicePixelRatio, 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 8, 16);
camera.lookAt(0, 0, 0);

// 清屏色循环：缓慢巡游色相，肉眼确认渲染循环存活（T02 起换 render/sky.ts 正式天空/背景）
renderer.setAnimationLoop((time) => {
  const hue = ((time ?? 0) * 0.00002) % 1;
  renderer.setClearColor(new THREE.Color().setHSL(hue, 0.35, 0.2, THREE.SRGBColorSpace));
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
