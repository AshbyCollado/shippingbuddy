"use client";

import {useEffect, useMemo} from "react";
import {useFrame, useThree} from "@react-three/fiber";
import {EffectComposer} from "three/examples/jsm/postprocessing/EffectComposer.js";
import {OutputPass} from "three/examples/jsm/postprocessing/OutputPass.js";
import {RenderPass} from "three/examples/jsm/postprocessing/RenderPass.js";
import {SSAOPass} from "three/examples/jsm/postprocessing/SSAOPass.js";

/**
 * A small, local post-processing stack: no remote assets and no extra runtime
 * dependency. The scene remains usable if a pass is unavailable on a device.
 */
export default function SceneEffects() {
  const {camera, gl, scene, size} = useThree();
  const pipeline = useMemo(() => {
    const composer = new EffectComposer(gl);
    const renderPass = new RenderPass(scene, camera);
    const ssaoPass = new SSAOPass(scene, camera, size.width, size.height);
    ssaoPass.kernelRadius = 14;
    ssaoPass.minDistance = 0.004;
    ssaoPass.maxDistance = 0.12;
    const outputPass = new OutputPass();
    composer.addPass(renderPass);
    composer.addPass(ssaoPass);
    composer.addPass(outputPass);
    return {composer};
  }, [camera, gl, scene, size.height, size.width]);

  useEffect(() => {
    pipeline.composer.setSize(size.width, size.height);
  }, [gl, pipeline, size.height, size.width]);

  useFrame(() => pipeline.composer.render(), 1);

  useEffect(() => () => pipeline.composer.dispose(), [pipeline]);

  return null;
}
