import * as THREE from "three";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";

export class RuntimeTextureLoader {
  private readonly imageLoader = new THREE.TextureLoader();
  private readonly ktx2Loader: KTX2Loader;

  constructor(renderer: THREE.WebGLRenderer, transcoderPath = "/basis/") {
    this.ktx2Loader = new KTX2Loader()
      .setTranscoderPath(transcoderPath)
      .detectSupport(renderer);
  }

  loadAsync(url: string): Promise<THREE.Texture> {
    return /\.ktx2(?:[?#]|$)/i.test(url)
      ? this.ktx2Loader.loadAsync(url)
      : this.imageLoader.loadAsync(url);
  }

  dispose() {
    this.ktx2Loader.dispose();
  }
}
