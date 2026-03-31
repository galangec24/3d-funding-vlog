import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

const ThreeScene = () => {
  const containerRef = useRef(null);
  
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050b1a);
    scene.fog = new THREE.FogExp2(0x050b1a, 0.008);
    
    // Camera
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, 12);
    camera.lookAt(0, 0, 0);
    
    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    containerRef.current.appendChild(renderer.domElement);
    
    // Lights
    const ambientLight = new THREE.AmbientLight(0x404060);
    scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(2, 5, 3);
    dirLight.castShadow = true;
    dirLight.receiveShadow = true;
    scene.add(dirLight);
    
    const backLight = new THREE.PointLight(0x3366ff, 0.5);
    backLight.position.set(-2, 1, -4);
    scene.add(backLight);
    
    const fillLight = new THREE.PointLight(0xff66cc, 0.3);
    fillLight.position.set(3, 1, 2);
    scene.add(fillLight);
    
    const rimLight = new THREE.PointLight(0xffaa33, 0.4);
    rimLight.position.set(0, 3, -3);
    scene.add(rimLight);
    
    // Main 3D Object - Rotating Geometric Core
    const group = new THREE.Group();
    
    // Core sphere with wireframe
    const coreGeo = new THREE.IcosahedronGeometry(0.9, 0);
    const coreMat = new THREE.MeshStandardMaterial({ 
      color: 0x3b82f6, 
      metalness: 0.8, 
      roughness: 0.2,
      emissive: 0x1e3a8a,
      emissiveIntensity: 0.5
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.castShadow = true;
    coreMesh.receiveShadow = true;
    group.add(coreMesh);
    
    // Outer rings
    const ringGeo = new THREE.TorusGeometry(1.3, 0.05, 64, 200);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x8b5cf6, emissive: 0x4c1d95, emissiveIntensity: 0.3 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    
    const ring2Geo = new THREE.TorusGeometry(1.6, 0.04, 64, 200);
    const ring2Mat = new THREE.MeshStandardMaterial({ color: 0x06b6d4, emissive: 0x164e63, emissiveIntensity: 0.3 });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.rotation.z = Math.PI / 3;
    group.add(ring2);
    
    const ring3Geo = new THREE.TorusGeometry(1.9, 0.03, 64, 200);
    const ring3Mat = new THREE.MeshStandardMaterial({ color: 0xec4899, emissive: 0x831843, emissiveIntensity: 0.2 });
    const ring3 = new THREE.Mesh(ring3Geo, ring3Mat);
    ring3.rotation.x = Math.PI / 4;
    ring3.rotation.z = Math.PI / 6;
    group.add(ring3);
    
    scene.add(group);
    
    // Floating particles
    const particleCount = 2500;
    const particlesGeometry = new THREE.BufferGeometry();
    const posArray = new Float32Array(particleCount * 3);
    const colorArray = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount; i++) {
      // Spherical distribution
      const radius = 8 + Math.random() * 5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      
      posArray[i*3] = radius * Math.sin(phi) * Math.cos(theta);
      posArray[i*3+1] = radius * Math.sin(phi) * Math.sin(theta) * 0.5;
      posArray[i*3+2] = radius * Math.cos(phi);
      
      const color = new THREE.Color().setHSL(0.6 + Math.random() * 0.3, 0.8, 0.5);
      colorArray[i*3] = color.r;
      colorArray[i*3+1] = color.g;
      colorArray[i*3+2] = color.b;
    }
    
    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
    
    const particleMat = new THREE.PointsMaterial({ size: 0.08, vertexColors: true, transparent: true, opacity: 0.6 });
    const particles = new THREE.Points(particlesGeometry, particleMat);
    scene.add(particles);
    
    // Stars background
    const starCount = 4000;
    const starGeo = new THREE.BufferGeometry();
    const starPos = [];
    for (let i = 0; i < starCount; i++) {
      starPos.push((Math.random() - 0.5) * 200);
      starPos.push((Math.random() - 0.5) * 100);
      starPos.push((Math.random() - 0.5) * 100 - 50);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(starPos), 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.06, transparent: true, opacity: 0.4 });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);
    
    // Animation variables
    let time = 0;
    
    // Animation loop
    function animate() {
      requestAnimationFrame(animate);
      time += 0.008;
      
      // Rotate main group
      group.rotation.y = time * 0.3;
      group.rotation.x = Math.sin(time * 0.2) * 0.15;
      group.rotation.z = Math.cos(time * 0.15) * 0.1;
      
      // Rotate rings independently
      ring.rotation.z += 0.015;
      ring2.rotation.x += 0.012;
      ring2.rotation.y += 0.008;
      ring3.rotation.y += 0.01;
      ring3.rotation.x += 0.007;
      
      // Animate particles
      particles.rotation.y += 0.0005;
      particles.rotation.x += 0.0003;
      stars.rotation.y += 0.0002;
      stars.rotation.x += 0.0001;
      
      // Smooth camera movement
      camera.position.x += (Math.sin(time * 0.1) * 0.3 - camera.position.x) * 0.02;
      camera.position.y += (Math.sin(time * 0.15) * 0.2 - camera.position.y) * 0.02;
      camera.lookAt(0, 0, 0);
      
      renderer.render(scene, camera);
    }
    
    animate();
    
    // Handle resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    
    window.addEventListener('resize', handleResize);
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);
  
  return <div ref={containerRef} className="fixed top-0 left-0 w-full h-full -z-10" />;
};

export default ThreeScene;