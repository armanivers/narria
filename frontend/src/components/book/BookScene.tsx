"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

type BookState = "closed-front" | "opening" | "open" | "flipping" | "closing" | "closed-back";

function AnimatedBook({
  state,
  pageImage
}: {
  state: BookState;
  pageImage: string | null;
}) {
  const coverRef = useRef<THREE.Mesh>(null);
  const pageRef = useRef<THREE.Mesh>(null);
  const texture = useMemo(() => {
    if (!pageImage) return null;
    return new THREE.TextureLoader().load(pageImage);
  }, [pageImage]);

  useFrame((_, delta) => {
    if (!coverRef.current || !pageRef.current) return;

    let targetCover = 0;
    let targetPage = 0;

    if (state === "opening" || state === "open" || state === "flipping") {
      targetCover = -Math.PI * 0.92;
    }
    if (state === "flipping") {
      targetPage = -Math.PI;
    }
    if (state === "closed-back") {
      targetCover = -Math.PI;
    }

    coverRef.current.rotation.y += (targetCover - coverRef.current.rotation.y) * delta * 5;
    pageRef.current.rotation.y += (targetPage - pageRef.current.rotation.y) * delta * 8;
  });

  return (
    <group position={[0, -0.2, 0]}>
      <mesh position={[0, 0, -0.12]} receiveShadow>
        <boxGeometry args={[2.5, 3.4, 0.2]} />
        <meshStandardMaterial color="#5e3a22" />
      </mesh>

      <mesh ref={pageRef} position={[0, 0, 0]} castShadow>
        <boxGeometry args={[2.35, 3.2, 0.03]} />
        <meshStandardMaterial color="#f8f0dc" />
      </mesh>

      <mesh position={[0, 0, 0.03]}>
        <planeGeometry args={[2.2, 3]} />
        {texture ? (
          <meshBasicMaterial map={texture} toneMapped={false} />
        ) : (
          <meshBasicMaterial color="#e6d9c0" />
        )}
      </mesh>

      <mesh ref={coverRef} position={[-1.25, 0, 0]} castShadow>
        <boxGeometry args={[0.15, 3.4, 2.5]} />
        <meshStandardMaterial color="#7b1f1f" />
      </mesh>
    </group>
  );
}

export default function BookScene({
  state,
  pageImage
}: {
  state: BookState;
  pageImage: string | null;
}) {
  return (
    <Canvas camera={{ position: [0, 1.5, 6], fov: 45 }} shadows>
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 6, 4]} intensity={1.2} castShadow />
      <AnimatedBook state={state} pageImage={pageImage} />
      <OrbitControls enablePan={false} enableZoom={false} />
    </Canvas>
  );
}
