import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { GameAudio } from "./audio.js";
import "./styles.css";

const GAME_SLUG = "robar-el-brainrot";
const canvas = document.querySelector("#game-canvas");
const playerIdentity = document.querySelector("#player-identity");
const moneyValue = document.querySelector("#money-value");
const incomeValue = document.querySelector("#income-value");
const shopMoney = document.querySelector("#shop-money");
const prompt = document.querySelector("#interaction-prompt");
const toast = document.querySelector("#toast");
const shopPanel = document.querySelector("#shop-panel");
const shopToggle = document.querySelector("#shop-toggle");
const audio = new GameAudio();
const avatarLoader = new GLTFLoader();
const accessoryLoader = new OBJLoader();

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#88d9ff");
scene.fog = new THREE.Fog(0xade8ff, 65, 150);

const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 220);
camera.position.set(0, 5, 7);
let cameraSensitivity = 1;
let cameraYaw = 0;
let cameraTargetYaw = 0;
let cameraPitch = 0.15;
let cameraDrag = null;
let boxityEnvironment = null;
let boxitySdk = null;
let avatarRig = null;
let avatarDressHandle = null;
let activeCharacter = null;
let activeOutfitKey = null;
let avatarReady = false;
let emoteCatalog = new Map();
let activeEmote = null;
let adBreakActive = false;
let gameplayReported = false;
const sdkUnsubscribers = [];

const hemiLight = new THREE.HemisphereLight("#e7faff", "#609356", 2.8);
scene.add(hemiLight);

const moonLight = new THREE.DirectionalLight("#fff5d6", 3.5);
moonLight.position.set(-24, 38, 18);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(2048, 2048);
moonLight.shadow.camera.left = -55;
moonLight.shadow.camera.right = 55;
moonLight.shadow.camera.top = 55;
moonLight.shadow.camera.bottom = -55;
moonLight.shadow.camera.near = 0.5;
moonLight.shadow.camera.far = 100;
moonLight.shadow.bias = -0.0005;
scene.add(moonLight);

const fillLight = new THREE.DirectionalLight("#a0c8ff", 0.6);
fillLight.position.set(20, 15, -20);
scene.add(fillLight);

const platforms = [];
const lootItems = [];
const bases = [];
const keys = new Set();
const clock = new THREE.Clock();

const player = {
  x: -15,
  y: 0,
  z: 0,
  vy: 0,
  grounded: true,
  facing: 0,
  speed: 7.2,
  jump: 9.5,
  upgradeJump: 0,
  capacity: 1,
  carried: [],
  cash: 250,
  upgrades: { speed: 0, jump: 0, capacity: 0 },
};

const worldState = {
  startAt: 0,
  lastInteraction: 0,
  toastUntil: 0,
  paused: false,
  closestLoot: null,
  nearBase: false,
  nearestBase: null,
  homeBase: null,
};

const RARITIES = [
  { name: "Común", color: "#82d45b", chance: 0.42, price: 35, income: 2 },
  { name: "Raro", color: "#58b9ff", chance: 0.28, price: 90, income: 6 },
  { name: "Épico", color: "#b278ff", chance: 0.17, price: 240, income: 18 },
  { name: "Legendario", color: "#ffad45", chance: 0.095, price: 650, income: 52 },
  { name: "Mítico", color: "#ff668f", chance: 0.035, price: 1800, income: 150 },
];

const BRAINROT_CATALOG = [
  { name: "Capibara Coco", shape: "capybara", color: "#c9925e" },
  { name: "Pato Patatín", shape: "duck", color: "#ffd85c" },
  { name: "Cactus Bailarín", shape: "cactus", color: "#64c66a" },
  { name: "Gatito Ravioli", shape: "cat", color: "#ff9d80" },
  { name: "Tortuga Tutti", shape: "turtle", color: "#55c8a0" },
  { name: "Llama Limón", shape: "llama", color: "#f6ca75" },
  { name: "Pollito Pop", shape: "chick", color: "#ffe978" },
  { name: "Panda Mochi", shape: "panda", color: "#f3eee6" },
  { name: "Conejo Churro", shape: "rabbit", color: "#efb4c6" },
  { name: "Ajolote Arcoíris", shape: "axolotl", color: "#ff8fc4" },
];

const BASE_ZONES = [-27, -9, 9, 27];
const BASE_COLORS = ["#ff8873", "#79c8ff", "#c89cff", "#ffd166", "#70d6a5", "#ff9ec2", "#a9c5ff", "#f7b267"];

const avatar = new THREE.Group();
const fallbackAvatar = createAvatar();
avatar.add(fallbackAvatar);
scene.add(avatar);
const followAccessories = [];
const carriedModels = [];

bindControls();
resize();
window.addEventListener("resize", resize);
updateHud();
shopToggle.addEventListener("click", () => {
  const isOpen = shopPanel.classList.toggle("is-open");
  shopToggle.setAttribute("aria-expanded", String(isOpen));
  shopPanel.setAttribute("aria-hidden", String(!isOpen));
});

async function boot() {
  try {
    if (!window.Legion?.SDK) throw new Error("No se cargó el SDK de Boxity.");
    boxitySdk = Legion.SDK;
    await Legion.SDK.init({ gameSlug: GAME_SLUG });
    configureBoxity();

    boxitySdk.game.loadingStep("Preparando tu avatar...");
    await createWorld();
    try {
      await refreshBoxityAvatar();
    } catch (error) {
      console.error("No se pudo cargar el avatar de Boxity:", error);
    }
    boxitySdk.game.loadingStep("Cargando emotes...");
    try {
      await loadEmoteCatalog();
    } catch (error) {
      console.error("No se pudo cargar el catálogo de emotes:", error);
    }
    renderer.render(scene, camera);
    boxitySdk.game.loadingEnd();
    boxitySdk.game.gameplayStart();
    gameplayReported = true;
  } catch (error) {
    console.error("No se pudo iniciar la integración de Boxity:", error);
    showToast("No se pudo conectar con Boxity; el juego continuará sin sus funciones.");
    boxitySdk?.game?.loadingEnd?.();
  }

  renderer.setAnimationLoop(animate);
}

void boot();

function configureBoxity() {
  boxityEnvironment = Legion.SDK.environment();
  if (!boxityEnvironment?.apiUrl || !boxityEnvironment?.staticUrl) {
    throw new Error("Boxity no proporcionó su entorno de plataforma.");
  }
  Legion.SDK.game.registerFeature("emotes");
  Legion.SDK.game.registerFeature("leaderboard");
  Legion.SDK.ads.declareScreens({ gameplay: {} });
  Legion.SDK.leaderboard.define([
    {
      id: "brainrots-stolen",
      label: "Brainrots robados",
      order: "desc",
      mode: "sum",
      format: "number",
      reset: "none",
    },
  ]);
  Legion.SDK.ads.onBreakStart(() => {
    adBreakActive = true;
    worldState.paused = true;
    keys.clear();
    audio.setMuted(true);
  });
  Legion.SDK.ads.onBreakEnd(() => {
    adBreakActive = false;
    worldState.paused = false;
    audio.setMuted(false);
  });

  const unsubscribeUser = Legion.SDK.auth.onUserChanged((user) => {
    const identity = user ?? Legion.SDK.auth.getGuest?.();
    playerIdentity.textContent = identity?.displayName || identity?.username || (typeof identity === "string" ? identity : "");
    if (avatarReady) refreshBoxityAvatar().catch((error) => console.error("No se pudo actualizar el avatar:", error));
  });
  sdkUnsubscribers.push(unsubscribeUser);

  sdkUnsubscribers.push(Legion.SDK.player.onEvent((event) => {
    if (event === "respawn_request") resetPlayerToSpawn();
  }));
  sdkUnsubscribers.push(Legion.SDK.player.onEvent((event, data) => {
    if (event === "play_emote") playEmote(data);
  }));
  sdkUnsubscribers.push(Legion.SDK.avatar.onAvatarChanged(() => {
    refreshBoxityAvatar().catch((error) => console.error("No se pudo actualizar el avatar:", error));
  }));
  sdkUnsubscribers.push(Legion.SDK.avatar.onProportionsChanged(() => {
    activeOutfitKey = null;
    refreshBoxityAvatar().catch((error) => console.error("No se pudieron actualizar las proporciones:", error));
  }));
  if (typeof Legion.SDK.onEnvironmentChanged === "function") {
    sdkUnsubscribers.push(Legion.SDK.onEnvironmentChanged((environment) => {
      boxityEnvironment = environment;
      loadEmoteCatalog().catch((error) => console.error("No se pudo actualizar el catálogo de emotes:", error));
      refreshBoxityAvatar().catch((error) => console.error("No se pudo actualizar el avatar:", error));
    }));
  }

  Legion.SDK.settings.listen("master_volume", (value) => audio.setMasterVolume(Number(value) / 100));
  Legion.SDK.settings.listen("music_volume", (value) => audio.setMusicVolume(Number(value) / 100));
  Legion.SDK.settings.listen("graphics_quality", applyGraphicsQuality);
  Legion.SDK.settings.listen("camera_sensitivity", (value) => {
    cameraSensitivity = THREE.MathUtils.clamp(Number(value) || 1, 0.1, 5);
  });
  Legion.SDK.settings.triggerAll();
  Legion.SDK.ads.screen("gameplay");
  const unsubscribeReservedAreas = Legion.SDK.ui.onReservedAreasChange(applyReservedAreas);
  sdkUnsubscribers.push(unsubscribeReservedAreas);

  window.addEventListener("pagehide", stopGameplay, { once: true });
}

function applyReservedAreas(areas) {
  const reservedBottom = (Array.isArray(areas) ? areas : []).reduce(
    (bottom, area) => Math.max(bottom, Number(area.top) + Number(area.height)),
    0,
  );
  document.documentElement.style.setProperty("--boxity-ui-top", `${reservedBottom}px`);
}

function applyGraphicsQuality(value) {
  const quality = {
    Low: { pixelRatio: 0.8, shadows: false, fog: 0.009, far: 120 },
    Medium: { pixelRatio: 1, shadows: true, fog: 0.011, far: 150 },
    High: { pixelRatio: 1.5, shadows: true, fog: 0.012, far: 180 },
    Ultra: { pixelRatio: 2, shadows: true, fog: 0.014, far: 220 },
  }[value] ?? { pixelRatio: 1.5, shadows: true, fog: 0.012, far: 180 };
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatio));
  renderer.shadowMap.enabled = quality.shadows;
  moonLight.castShadow = quality.shadows;
  scene.fog.density = quality.fog;
  camera.far = quality.far;
  camera.updateProjectionMatrix();
  resize();
}

function stopGameplay() {
  if (!gameplayReported || !boxitySdk?.game) return;
  gameplayReported = false;
  if (typeof boxitySdk.game.gameplayStop === "function") {
    boxitySdk.game.gameplayStop();
  } else {
    boxitySdk.game.gameplayEnd();
  }
  Legion.SDK.ads.hideScreen();
  for (const unsubscribe of sdkUnsubscribers.splice(0)) {
    if (typeof unsubscribe === "function") unsubscribe();
  }
}

function platformUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

async function refreshBoxityAvatar() {
  if (!boxitySdk || !boxityEnvironment) return;
  const equipped = Legion.SDK.avatar.getEquipped();
  const outfitKey = Legion.SDK.avatar.getOutfitKey();
  const characterId = equipped.characterId;
  const hasCustomCharacter = characterId && !["-1", "undefined", "null"].includes(String(characterId));
  const loadVersion = (refreshBoxityAvatar.version ?? 0) + 1;
  refreshBoxityAvatar.version = loadVersion;

  if (!hasCustomCharacter && avatarRig && !activeCharacter && avatarDressHandle && outfitKey !== activeOutfitKey) {
    await avatarDressHandle.update(outfitKey);
    if (loadVersion === refreshBoxityAvatar.version) activeOutfitKey = outfitKey;
    return;
  }

  const character = hasCustomCharacter ? await Legion.SDK.avatar.getCharacterFor(equipped) : null;
  const modelUrl = character?.glbUrl || platformUrl(boxityEnvironment.staticUrl, "avatars/player.glb");
  const gltf = await avatarLoader.loadAsync(modelUrl);
  if (loadVersion !== refreshBoxityAvatar.version) return;

  const nextRig = gltf.scene;
  const proportions = hasCustomCharacter ? null : Legion.SDK.avatar.getProportions();
  const height = proportions?.height ?? 1;
  nextRig.scale.set(0.25, 0.25 * height, 0.25);
  nextRig.updateMatrixWorld(true);
  for (const { object } of followAccessories) {
    scene.remove(object);
    disposeObject(object);
  }
  followAccessories.length = 0;
  if (avatarRig) avatar.remove(avatarRig);
  avatarRig = nextRig;
  avatar.add(avatarRig);
  avatar.updateMatrixWorld(true);
  avatarRig.updateMatrixWorld(true);
  fallbackAvatar.visible = false;
  activeCharacter = character;
  activeOutfitKey = outfitKey;
  avatarDressHandle = null;

  if (character) {
    await applyCustomCharacterAccessories(avatarRig, equipped, character);
  } else {
    if (typeof Legion.SDK.character?.canDress === "function" && Legion.SDK.character.canDress(outfitKey)) {
      avatarDressHandle = await Legion.SDK.character.dress({
        THREE,
        GLTFLoader,
        root: avatarRig,
        outfitKey,
      });
    }
    if (!avatarDressHandle) await applyFallbackAvatarAppearance(avatarRig, equipped);
  }
  avatarReady = true;
}

async function applyFallbackAvatarAppearance(root, equipped) {
  const skinTextureUrl = Legion.SDK.avatar.getSkinTextureUrlFor(equipped);
  if (skinTextureUrl) {
    const skinTexture = await new THREE.TextureLoader().loadAsync(skinTextureUrl);
    skinTexture.colorSpace = THREE.SRGBColorSpace;
    root.traverse((object) => {
      if (!object.isSkinnedMesh || !object.material) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        material.map = skinTexture;
        material.needsUpdate = true;
      }
    });
  }

  const slots = [
    { field: "hatId", bone: "Neck1", origin: [0, 0.8, 0] },
    { field: "backId", bone: "Spine2", origin: [0, 0, 0] },
    ...Legion.SDK.avatar.getAccessorySlots(),
  ];
  await Promise.all(slots.map((slot) => attachAvatarAccessory(root, equipped, slot)));
}

async function applyCustomCharacterAccessories(root, equipped, character) {
  const slots = [
    { field: "hatId", bone: "Neck1", origin: [0, 5.6, 0] },
    { field: "backId", bone: "Spine2", origin: [0, 4.2, 0] },
    ...Legion.SDK.avatar.getAccessorySlots().map((slot) => (
      ["hairId", "maskId"].includes(slot.field) ? { ...slot, origin: [0, 5.6, 0] } : slot
    )),
  ];
  await Promise.all(slots.map((slot) => attachAvatarAccessory(root, equipped, slot, character)));
}

async function attachAvatarAccessory(root, equipped, slot, character = null) {
  const id = equipped[slot.field];
  if (!id || ["-1", "undefined", "null"].includes(String(id))) return;
  const urls = Legion.SDK.avatar.getAccessoryUrls(slot.field, id);
  if (!urls?.mesh) return;

  try {
    const [object, texture] = await Promise.all([
      accessoryLoader.loadAsync(urls.mesh),
      urls.texture ? new THREE.TextureLoader().loadAsync(urls.texture) : Promise.resolve(null),
    ]);
    if (texture) texture.colorSpace = THREE.SRGBColorSpace;
    object.traverse((child) => {
      if (!child.isMesh) return;
      child.material = new THREE.MeshStandardMaterial({
        map: texture,
        metalness: 0.05,
        roughness: 0.72,
      });
      child.castShadow = true;
    });

    const boneNames = [slot.bone, slot.mirrorBone].filter(Boolean);
    for (const [index, boneName] of boneNames.entries()) {
      const bone = root.getObjectByName(boneName);
      if (!bone) continue;
      const accessory = index === 0 ? object : object.clone(true);
      const placement = new THREE.Matrix4().makeTranslation(...(slot.origin ?? [0, 0, 0]));
      let localMatrix;
      if (character) {
        const characterMatrix = Legion.SDK.avatar.characterAccessoryMatrix(character, boneName);
        localMatrix = characterMatrix ? new THREE.Matrix4().fromArray(characterMatrix) : bone.matrixWorld.clone().invert().multiply(root.matrixWorld);
      } else {
        localMatrix = bone.matrixWorld.clone().invert().multiply(root.matrixWorld);
      }
      if (index > 0) localMatrix.multiply(new THREE.Matrix4().makeScale(-1, 1, 1));
      localMatrix.multiply(placement);

      if (slot.inheritScale === false) {
        accessory.matrix.copy(localMatrix);
        accessory.matrixAutoUpdate = false;
        scene.add(accessory);
        followAccessories.push({ object: accessory, bone, localMatrix });
      } else {
        accessory.matrix.copy(localMatrix);
        accessory.matrixAutoUpdate = false;
        bone.add(accessory);
      }
    }
  } catch (error) {
    console.error(`No se pudo cargar el accesorio ${slot.field}:`, error);
  }
}

function updateFollowAccessories() {
  for (const { object, bone, localMatrix } of followAccessories) {
    const position = new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld);
    const rotation = new THREE.Quaternion().setFromRotationMatrix(bone.matrixWorld);
    const transform = new THREE.Matrix4().compose(position, rotation, new THREE.Vector3(1, 1, 1));
    object.matrix.copy(transform.multiply(localMatrix));
  }
}

async function loadEmoteCatalog() {
  const response = await fetch(platformUrl(boxityEnvironment.apiUrl, "v1/avatar/emotes"));
  if (!response.ok) throw new Error(`El catálogo de emotes respondió ${response.status}.`);
  const result = await response.json();
  const emotes = Array.isArray(result) ? result : result.emotes ?? result.data ?? [];
  emoteCatalog = new Map(emotes.map((emote) => [emote.id, emote.clip]).filter((entry) => entry[1]));
}

function playEmote(emoteId) {
  const clip = emoteCatalog.get(emoteId);
  if (!clip || !avatarRig) return;
  stopEmote();
  const bones = new Map();
  avatarRig.traverse((object) => {
    if (object.isBone) bones.set(object.name, object.quaternion.clone());
  });
  activeEmote = { clip, startedAt: performance.now() / 1000, bones };
}

function stopEmote() {
  if (!activeEmote) return;
  for (const [name, quaternion] of activeEmote.bones) {
    const bone = avatarRig?.getObjectByName(name);
    if (bone) bone.quaternion.copy(quaternion);
  }
  activeEmote = null;
}

function updateEmote(now) {
  if (!activeEmote || !avatarRig) return;
  const { clip, startedAt, bones } = activeEmote;
  const length = Number(clip.len);
  if (!(length > 0)) return stopEmote();
  const elapsed = now - startedAt;
  const time = clip.loop ? elapsed % length : Math.min(elapsed, length);
  const blend = Math.min(1, elapsed / 0.1);

  for (const [name, keysForBone] of Object.entries(clip.tracks ?? {})) {
    const bone = avatarRig.getObjectByName(name);
    const bind = bones.get(name);
    if (!bone || !bind || !keysForBone.length) continue;

    let left = keysForBone[0];
    let right = left;
    for (let index = 1; index < keysForBone.length; index += 1) {
      if (time <= keysForBone[index][0]) {
        right = keysForBone[index];
        left = keysForBone[index - 1];
        break;
      }
      left = keysForBone[index];
      right = left;
    }
    const span = right[0] - left[0];
    const rawProgress = span > 0 ? THREE.MathUtils.clamp((time - left[0]) / span, 0, 1) : 0;
    const progress = rawProgress * rawProgress * (3 - 2 * rawProgress);
    const radians = [1, 2, 3].map((index) => THREE.MathUtils.degToRad(left[index] + (right[index] - left[index]) * progress));
    const delta = new THREE.Quaternion().setFromEuler(new THREE.Euler(...radians, "XYZ"));
    const target = bind.clone().multiply(delta);
    bone.quaternion.copy(bind).slerp(target, blend);
  }
  if (!clip.loop && elapsed >= length) stopEmote();
}

function resetPlayerToSpawn() {
  keys.clear();
  stopEmote();
  player.x = worldState.homeBase?.x ?? 0;
  player.y = 0;
  player.z = worldState.homeBase?.z ?? 0;
  player.vy = 0;
  player.grounded = true;
  avatar.position.set(player.x, 0, player.z);
  syncCarriedModels();
  showToast("Volviste a tu base");
}

function createLegacyWorld() {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: "#12192d", roughness: 0.93, metalness: 0.04 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -4;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(180, 90, "#283451", "#19233b");
  grid.position.y = -3.96;
  grid.material.transparent = true;
  grid.material.opacity = 0.24;
  scene.add(grid);

  for (const spec of platformSpecs) {
    const color = spec.kind === "base" ? "#172b3b" : spec.kind === "vault" ? "#33283d" : "#1d2940";
    const edgeColor = spec.kind === "vault" ? "#ffcc70" : "#5df4d5";
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(spec.width, 0.8, spec.depth),
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.5,
        metalness: 0.34,
        emissive: spec.kind === "vault" ? "#4c2b42" : "#0c2832",
        emissiveIntensity: 0.32,
      }),
    );
    mesh.position.set(spec.x, spec.y - 0.4, spec.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(spec.width, 0.8, spec.depth)),
      new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.8 }),
    );
    edge.position.copy(mesh.position);
    scene.add(edge);

    const top = new THREE.Mesh(
      new THREE.BoxGeometry(spec.width - 0.26, 0.06, spec.depth - 0.26),
      new THREE.MeshStandardMaterial({
        color: spec.kind === "vault" ? "#594252" : "#233247",
        roughness: 0.72,
        metalness: 0.18,
      }),
    );
    top.position.set(spec.x, spec.y + 0.02, spec.z);
    top.receiveShadow = true;
    scene.add(top);

    platforms.push({
      minX: spec.x - spec.width / 2,
      maxX: spec.x + spec.width / 2,
      minZ: spec.z - spec.depth / 2,
      maxZ: spec.z + spec.depth / 2,
      y: spec.y,
    });

    addPlatformDetails(spec, edgeColor);
  }

  createBaseMarker();
  createVaultArch();
  createCourseMarkers();
}

function addPlatformDetails(spec, color) {
  const cornerMaterial = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.8,
    roughness: 0.25,
    metalness: 0.2,
  });
  const postGeometry = new THREE.CylinderGeometry(0.08, 0.12, 0.5, 8);
  const corners = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ];
  for (const [sx, sz] of corners) {
    const post = new THREE.Mesh(postGeometry, cornerMaterial);
    post.position.set(spec.x + sx * (spec.width / 2 - 0.12), spec.y + 0.28, spec.z + sz * (spec.depth / 2 - 0.12));
    post.castShadow = true;
    scene.add(post);
  }
}

function createBaseMarker() {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.4, 0.06, 8, 64),
    new THREE.MeshStandardMaterial({ color: "#54f3d0", emissive: "#26d6bb", emissiveIntensity: 1.8 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 0.1, 0);
  scene.add(ring);

  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.28, 2.1, 12),
    new THREE.MeshStandardMaterial({ color: "#72ffe0", emissive: "#54f3d0", emissiveIntensity: 1.2, transparent: true, opacity: 0.24 }),
  );
  beacon.position.set(-3.8, 1.15, -3.8);
  scene.add(beacon);
}

function createVaultArch() {
  const archMaterial = new THREE.MeshStandardMaterial({
    color: "#e5a8ff",
    emissive: "#9b55e3",
    emissiveIntensity: 1.3,
    metalness: 0.36,
    roughness: 0.25,
  });
  const leftPost = new THREE.Mesh(new THREE.BoxGeometry(0.24, 3.4, 0.24), archMaterial);
  leftPost.position.set(22.5, 2.7, -3.2);
  const rightPost = leftPost.clone();
  rightPost.position.x = 27.5;
  const top = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.24, 0.24), archMaterial);
  top.position.set(25, 4.32, -3.2);
  scene.add(leftPost, rightPost, top);
}

function createCourseMarkers() {
  const markerSpecs = [
    { x: 5.9, z: 0, color: "#54f3d0" },
    { x: 10.3, z: -1, color: "#8cc9ff" },
    { x: 15.6, z: -0.5, color: "#b895ff" },
    { x: 21, z: 0.5, color: "#ffd76f" },
  ];
  for (const marker of markerSpecs) {
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8),
      new THREE.MeshBasicMaterial({ color: marker.color, transparent: true, opacity: 0.34 }),
    );
    beacon.position.set(marker.x, 0.5, marker.z);
    scene.add(beacon);
  }
}

function createLoot() {
  for (const [index, spec] of lootSpecs.entries()) {
    const group = createCollectible(spec);
    group.position.set(spec.x, spec.y + 0.85, spec.z);
    scene.add(group);
    lootItems.push({
      ...spec,
      group,
      index,
      available: true,
      baseY: spec.y + 0.85,
      respawnAt: 0,
    });
  }
}

function createCollectible(spec) {
  const group = new THREE.Group();
  const color = new THREE.Color(spec.color);
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.34,
    metalness: 0.08,
    emissive: color,
    emissiveIntensity: 0.45,
  });

  let body;
  if (spec.shape === "toast") {
    body = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.7, 0.38, 2, 2, 1), bodyMaterial);
    body.rotation.z = -0.12;
  } else if (spec.shape === "pixel") {
    body = new THREE.Mesh(new THREE.DodecahedronGeometry(0.54, 1), bodyMaterial);
  } else {
    body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 18), bodyMaterial);
    if (spec.shape === "frog") body.scale.set(1.05, 0.82, 1);
  }
  body.position.y = 0.2;
  body.castShadow = true;
  group.add(body);

  const eyeMaterial = new THREE.MeshStandardMaterial({ color: "#fff8ef", roughness: 0.2 });
  const pupilMaterial = new THREE.MeshStandardMaterial({ color: "#171626", roughness: 0.18 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), eyeMaterial);
    eye.position.set(side * 0.19, 0.34, 0.39);
    eye.scale.set(1, 1.15, 0.6);
    group.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 10), pupilMaterial);
    pupil.position.set(side * 0.19 + 0.02, 0.34, 0.475);
    group.add(pupil);
  }

  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(0.09, 0.018, 6, 16, Math.PI),
    new THREE.MeshBasicMaterial({ color: "#211a2c" }),
  );
  smile.position.set(0, 0.04, 0.48);
  smile.rotation.z = Math.PI;
  group.add(smile);

  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.035, 0.35, 7),
    new THREE.MeshStandardMaterial({ color: "#d8d8ff", metalness: 0.45, roughness: 0.3 }),
  );
  antenna.position.set(0, 0.77, 0);
  group.add(antenna);
  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 12, 10),
    new THREE.MeshStandardMaterial({ color: spec.color, emissive: spec.color, emissiveIntensity: 1.7 }),
  );
  tip.position.set(0, 0.97, 0);
  group.add(tip);

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.72, 0.025, 6, 48),
    new THREE.MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0.78 }),
  );
  halo.rotation.x = Math.PI / 2;
  halo.position.y = -0.22;
  group.add(halo);

  const light = new THREE.PointLight(spec.color, 5, 5, 2);
  light.position.y = 0.25;
  group.add(light);
  return group;
}

function createAvatar() {
  const group = new THREE.Group();
  const suitMaterial = new THREE.MeshStandardMaterial({ color: "#59b879", roughness: 0.78 });
  const skinMaterial = new THREE.MeshStandardMaterial({ color: "#f1d8c6", roughness: 0.85 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: "#382e39", roughness: 0.7 });
  const makePart = (size, position, material) => {
    const part = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    part.position.set(...position);
    part.castShadow = true;
    group.add(part);
    return part;
  };
  makePart([0.72, 0.72, 0.42], [0, 0.84, 0], suitMaterial);
  makePart([0.64, 0.62, 0.58], [0, 1.62, 0], skinMaterial);
  for (const side of [-1, 1]) {
    makePart([0.11, 0.13, 0.07], [side * 0.16, 1.69, 0.31], darkMaterial);
    makePart([0.24, 0.68, 0.25], [side * 0.48, 0.88, 0], skinMaterial);
    makePart([0.25, 0.58, 0.28], [side * 0.2, 0.27, 0], suitMaterial);
    makePart([0.32, 0.15, 0.39], [side * 0.2, 0.045, 0.05], darkMaterial);
  }
  makePart([0.3, 0.2, 0.1], [0, 1.38, 0.32], new THREE.MeshStandardMaterial({ color: "#f2ae54" }));
  makePart([0.82, 0.15, 0.72], [0, 2.02, 0], new THREE.MeshStandardMaterial({ color: "#f2ae54" }));
  for (const side of [-1, 1]) {
    makePart([0.13, 0.15, 0.17], [side * 0.22, 2.1, 0], new THREE.MeshStandardMaterial({ color: "#fff1bd" }));
  }

  return group;
}

function createStars() {
  const positions = [];
  for (let index = 0; index < 600; index += 1) {
    positions.push(
      THREE.MathUtils.randFloatSpread(110),
      THREE.MathUtils.randFloat(8, 60),
      THREE.MathUtils.randFloatSpread(100),
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const stars = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ color: "#b9c9ff", size: 0.13, transparent: true, opacity: 0.65, sizeAttenuation: true }),
  );
  scene.add(stars);
}

async function createWorld() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(140, 140),
    new THREE.MeshStandardMaterial({ color: "#7acb5e", roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  platforms.push({ minX: -36, maxX: 36, minZ: -46, maxZ: 46, y: 0 });

  for (let index = 0; index < 18; index += 1) {
    const side = index % 2 ? -1 : 1;
    createTree(side * (27 + index % 4), -40 + index * 4.5, ["#fff1a8", "#ff9dbc", "#ffffff"][index % 3]);
    if (index % 3 === 0) await nextFrame();
  }

  for (let ci = 0; ci < 6; ci += 1) {
    const cloud = new THREE.Mesh(
      new THREE.SphereGeometry(2 + Math.random() * 1.5, 8, 6),
      new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1, transparent: true, opacity: 0.75 }),
    );
    cloud.position.set(THREE.MathUtils.randFloatSpread(80), 18 + Math.random() * 8, THREE.MathUtils.randFloatSpread(80));
    cloud.scale.set(1 + Math.random(), 0.5, 1 + Math.random());
    scene.add(cloud);
  }

  for (let bi = 0; bi < 12; bi += 1) {
    const bush = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.4 + Math.random() * 0.3, 0),
      new THREE.MeshStandardMaterial({ color: "#5aa84a", roughness: 0.95 }),
    );
    const angle = (bi / 12) * Math.PI * 2;
    const r = 38 + Math.random() * 8;
    bush.position.set(Math.cos(angle) * r, 0.3, Math.sin(angle) * r);
    bush.castShadow = true;
    scene.add(bush);
  }

  const lane = new THREE.Group();
  const belt = new THREE.Mesh(
    new THREE.BoxGeometry(5.2, 0.24, 86),
    new THREE.MeshStandardMaterial({ color: "#c47a44", roughness: 0.72, metalness: 0.12 }),
  );
  belt.position.y = 0.12;
  belt.receiveShadow = true;
  belt.castShadow = true;
  lane.add(belt);
  const beltTop = new THREE.Mesh(
    new THREE.BoxGeometry(4.65, 0.08, 85.7),
    new THREE.MeshStandardMaterial({ color: "#e8b56e", roughness: 0.55, metalness: 0.06 }),
  );
  beltTop.position.y = 0.28;
  beltTop.receiveShadow = true;
  lane.add(beltTop);
  for (const x of [-2.7, 2.7]) {
    const railMat = new THREE.MeshStandardMaterial({
      color: "#fff2c7",
      emissive: "#ffd97a",
      emissiveIntensity: 0.35,
      roughness: 0.35,
      metalness: 0.45,
    });
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.36, 86), railMat);
    rail.position.set(x, 0.28, 0);
    rail.castShadow = true;
    lane.add(rail);
    const railGlow = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.04, 86),
      new THREE.MeshBasicMaterial({ color: "#ffeaa0", transparent: true, opacity: 0.85 }),
    );
    railGlow.position.set(x, 0.48, 0);
    lane.add(railGlow);
  }
  for (let index = 0; index < 18; index += 1) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 0.03, 1.4),
      new THREE.MeshStandardMaterial({
        color: "#fff7e2",
        emissive: "#fff0c0",
        emissiveIntensity: 0.22,
        roughness: 0.5,
      }),
    );
    stripe.position.set(0, 0.34, -41 + index * 4.8);
    stripe.userData.offset = index * 4.8;
    lane.add(stripe);
  }
  for (const x of [-2.62, 2.62]) {
    for (let zi = 0; zi < 12; zi += 1) {
      const stud = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 0.06, 8),
        new THREE.MeshStandardMaterial({ color: "#a86a3c", roughness: 0.7, metalness: 0.1 }),
      );
      stud.position.set(x, 0.33, -38 + zi * 7);
      stud.castShadow = true;
      lane.add(stud);
    }
  }
  lane.userData.stripes = lane.children.filter((child) => child.userData.offset !== undefined);
  scene.add(lane);
  worldState.lane = lane;

  const gateFrame = new THREE.Group();
  const gateMat = new THREE.MeshStandardMaterial({
    color: "#d4a060",
    emissive: "#ff9e3c",
    emissiveIntensity: 0.3,
    metalness: 0.5,
    roughness: 0.3,
  });
  for (const z of [-43, 43]) {
    for (const x of [-2.7, 2.7]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 3.2, 10), gateMat);
      post.position.set(x, 1.7, z);
      post.castShadow = true;
      gateFrame.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.22, 0.22), gateMat);
    beam.position.set(0, 3.2, z);
    beam.castShadow = true;
    gateFrame.add(beam);
    const gateLight = new THREE.PointLight("#ffb84d", 4, 12, 2);
    gateLight.position.set(0, 2.8, z);
    gateFrame.add(gateLight);
  }
  scene.add(gateFrame);

  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(5, 16, 12),
    new THREE.MeshBasicMaterial({ color: "#fff1a9" }),
  );
  sun.position.set(-32, 34, -35);
  scene.add(sun);

  let baseIndex = 0;
  for (const side of [-1, 1]) {
    for (const z of BASE_ZONES) {
      const base = createBase({
        id: baseIndex,
        x: side * 14,
        z,
        side,
        color: BASE_COLORS[baseIndex],
        isPlayer: baseIndex === 5,
      });
      bases.push(base);
      if (base.isPlayer) worldState.homeBase = base;
      baseIndex += 1;
      await nextFrame();
    }
  }
  player.x = worldState.homeBase.x;
  player.z = worldState.homeBase.z;
  avatar.position.set(player.x, player.y, player.z);
  await populateConveyor();
  updateLabels();
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => {
    renderer.render(scene, camera);
    resolve();
  }));
}

function createTree(x, z, blossomColor) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.46, 2.6, 7),
    new THREE.MeshStandardMaterial({ color: "#9b6946", roughness: 1 }),
  );
  trunk.position.set(x, 1.3, z);
  trunk.castShadow = true;
  scene.add(trunk);
  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(1.7, 10, 8),
    new THREE.MeshStandardMaterial({ color: blossomColor, roughness: 0.92 }),
  );
  crown.position.set(x, 3.1, z);
  crown.scale.set(1, 0.85, 1);
  crown.castShadow = true;
  scene.add(crown);
}

function createBase(spec) {
  const group = new THREE.Group();
  group.position.set(spec.x, 0, spec.z);
  scene.add(group);

  const foundation = new THREE.Mesh(
    new THREE.BoxGeometry(12, 0.42, 13),
    new THREE.MeshStandardMaterial({ color: "#e0b878", roughness: 0.85 }),
  );
  foundation.position.y = 0.05;
  foundation.castShadow = true;
  foundation.receiveShadow = true;
  group.add(foundation);
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(11.4, 0.12, 12.4),
    new THREE.MeshStandardMaterial({ color: "#fff4d8", roughness: 0.9 }),
  );
  floor.position.y = 0.31;
  floor.receiveShadow = true;
  group.add(floor);

  const tileMat = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.62, metalness: 0.06 });
  for (let ti = 0; ti < 4; ti += 1) {
    const tile = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.04, 5.2), tileMat);
    tile.position.set(ti % 2 === 0 ? -2.8 : 2.8, 0.38, ti < 2 ? -2.8 : 2.8);
    tile.receiveShadow = true;
    group.add(tile);
  }

  const columnMaterial = new THREE.MeshStandardMaterial({ color: "#fffaf0", roughness: 0.72 });
  for (const x of [-5.35, 5.35]) {
    for (const z of [-5.85, 5.85]) {
      const column = new THREE.Mesh(new THREE.BoxGeometry(0.48, 4.35, 0.48), columnMaterial);
      column.position.set(x, 2.46, z);
      column.castShadow = true;
      group.add(column);
      const footing = new THREE.Mesh(
        new THREE.BoxGeometry(0.72, 0.22, 0.72),
        new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.6 }),
      );
      footing.position.set(x, 0.53, z);
      group.add(footing);
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(0.58, 0.12, 0.58),
        new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.55, metalness: 0.1 }),
      );
      cap.position.set(x, 4.72, z);
      group.add(cap);
    }
  }

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(12.4, 0.48, 13.4),
    new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.74 }),
  );
  roof.position.y = 4.9;
  roof.castShadow = true;
  group.add(roof);
  const roofTrim = new THREE.Mesh(
    new THREE.BoxGeometry(12.1, 0.15, 13.1),
    new THREE.MeshStandardMaterial({ color: "#fff0c7", roughness: 0.65 }),
  );
  roofTrim.position.y = 4.58;
  group.add(roofTrim);
  const roofGlow = new THREE.Mesh(
    new THREE.BoxGeometry(12.6, 0.06, 13.6),
    new THREE.MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0.5 }),
  );
  roofGlow.position.y = 5.18;
  group.add(roofGlow);

  const sign = createBaseSign(spec.isPlayer ? "TU BASE" : "BASE LIBRE", spec.color);
  sign.position.set(-spec.side * 5.82, 4.05, 0);
  sign.rotation.y = -spec.side * Math.PI / 2;
  group.add(sign);

  const slots = [];
  const pedestalMaterial = new THREE.MeshStandardMaterial({ color: "#e0b878", roughness: 0.5, metalness: 0.18 });
  const pedestalGlowMaterial = new THREE.MeshStandardMaterial({
    color: "#bbffe0",
    emissive: "#56ffae",
    emissiveIntensity: 0.85,
    roughness: 0.3,
    metalness: 0.15,
  });
  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const x = -spec.side * (3.45 - column * 2.15);
      const z = row === 0 ? -2.75 : 2.75;
      const pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(0.78, 0.92, 0.5, 16),
        pedestalMaterial,
      );
      pedestal.position.set(x, 0.6, z);
      pedestal.castShadow = true;
      pedestal.receiveShadow = true;
      group.add(pedestal);
      const pedestalRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.82, 0.05, 8, 32),
        new THREE.MeshStandardMaterial({ color: spec.color, emissive: spec.color, emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.3 }),
      );
      pedestalRing.rotation.x = Math.PI / 2;
      pedestalRing.position.set(x, 0.72, z);
      group.add(pedestalRing);
      const top = new THREE.Mesh(
        new THREE.CylinderGeometry(0.72, 0.72, 0.14, 20),
        pedestalGlowMaterial,
      );
      top.position.set(x, 0.9, z);
      group.add(top);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.74, 0.04, 6, 28),
        new THREE.MeshBasicMaterial({ color: "#73ffc0" }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, 0.98, z);
      group.add(ring);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 2.2, 8),
        new THREE.MeshBasicMaterial({ color: "#73ffc0", transparent: true, opacity: 0.2 }),
      );
      beam.position.set(x, 2.0, z);
      group.add(beam);
      const slotLight = new THREE.PointLight("#56ffae", 1.5, 4, 2);
      slotLight.position.set(x, 1.0, z);
      group.add(slotLight);
      slots.push({ x: spec.x + x, y: 1.0, z: spec.z + z, brainrot: null, model: null });
    }
  }

  const bank = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.2, 2.2),
    new THREE.MeshStandardMaterial({
      color: "#3eff7a",
      emissive: "#15d84e",
      emissiveIntensity: 0.65,
      roughness: 0.3,
      metalness: 0.15,
    }),
  );
  bank.position.set(-spec.side * 4.05, 0.48, 0);
  bank.castShadow = true;
  group.add(bank);
  const bankGlow = new THREE.Mesh(
    new THREE.BoxGeometry(2.7, 0.04, 2.3),
    new THREE.MeshBasicMaterial({ color: "#3eff7a", transparent: true, opacity: 0.6 }),
  );
  bankGlow.position.set(-spec.side * 4.05, 0.6, 0);
  group.add(bankGlow);
  const bankMark = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.07, 6, 20),
    new THREE.MeshBasicMaterial({ color: "#efffc0" }),
  );
  bankMark.rotation.x = Math.PI / 2;
  bankMark.position.set(-spec.side * 4.05, 0.6, 0);
  group.add(bankMark);
  const bankSign = createTextSprite("$", "#0a3d18", "#3eff7a", 72);
  bankSign.position.set(-spec.side * 4.05, 1.3, 0);
  bankSign.scale.set(1.4, 0.5, 1);
  group.add(bankSign);
  const bankLight = new THREE.PointLight("#3eff7a", 2.5, 6, 2);
  bankLight.position.set(-spec.side * 4.05, 0.8, 0);
  group.add(bankLight);

  const barrier = new THREE.Group();
  const postMaterial = new THREE.MeshStandardMaterial({ color: "#3a4250", metalness: 0.72, roughness: 0.28 });
  for (const z of [-4.25, 4.25]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 2.7, 12), postMaterial);
    post.position.set(-spec.side * 5.1, 1.65, z);
    post.castShadow = true;
    barrier.add(post);
    const postCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 12, 10),
      new THREE.MeshStandardMaterial({ color: spec.color, emissive: spec.color, emissiveIntensity: 0.8 }),
    );
    postCap.position.set(-spec.side * 5.1, 3.0, z);
    barrier.add(postCap);
  }
  const laserMaterial = new THREE.MeshStandardMaterial({
    color: "#ff5876",
    emissive: "#ff174d",
    emissiveIntensity: 2.5,
    transparent: true,
    opacity: 0.85,
  });
  for (const y of [0.85, 1.6, 2.35]) {
    const laser = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 8.4), laserMaterial);
    laser.position.set(-spec.side * 5.1, y, 0);
    barrier.add(laser);
    const laserGlow = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.05, 8.5),
      new THREE.MeshBasicMaterial({ color: "#ff174d", transparent: true, opacity: 0.3 }),
    );
    laserGlow.position.set(-spec.side * 5.1, y, 0);
    barrier.add(laserGlow);
  }
  group.add(barrier);

  const shieldDisplay = createTextSprite("ESCUDO 01:00", "#ffffff", "#3a4250", 28);
  shieldDisplay.position.set(-spec.side * 5.65, 3.15, 0);
  shieldDisplay.scale.set(3.5, 0.9, 1);
  group.add(shieldDisplay);

  const platform = { minX: spec.x - 6, maxX: spec.x + 6, minZ: spec.z - 6.5, maxZ: spec.z + 6.5, y: 0 };
  platforms.push(platform);
  return { ...spec, group, slots, bank, shieldDisplay, shieldTimeLeft: 60, lastShieldSecond: 60, accrued: 0, platform };
}

function createBaseSign(text, color) {
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(5.4, 1.35),
    new THREE.MeshBasicMaterial({ map: createTextTexture(text, "#ffffff", color, 48), side: THREE.DoubleSide }),
  );
  return sign;
}

function createTextTexture(text, textColor, background, fontSize) {
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 768;
  labelCanvas.height = 192;
  const context = labelCanvas.getContext("2d");
  context.fillStyle = background;
  context.beginPath();
  context.roundRect(8, 8, 752, 176, 30);
  context.fill();
  context.strokeStyle = "rgba(255,255,255,.9)";
  context.lineWidth = 8;
  context.stroke();
  context.fillStyle = textColor;
  context.font = `800 ${fontSize}px Manrope, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 384, 96, 720);
  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createTextSprite(text, textColor = "#fff", background = "#785c47", fontSize = 42) {
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 512;
  labelCanvas.height = 144;
  const context = labelCanvas.getContext("2d");
  context.fillStyle = background;
  context.beginPath();
  context.roundRect(8, 8, 496, 128, 28);
  context.fill();
  context.strokeStyle = "rgba(255,255,255,.8)";
  context.lineWidth = 6;
  context.stroke();
  context.fillStyle = textColor;
  context.font = `bold ${fontSize}px Manrope, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 256, 72, 470);
  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.userData.canvasTexture = texture;
  sprite.userData.canvas = labelCanvas;
  sprite.userData.textColor = textColor;
  sprite.userData.background = background;
  sprite.userData.fontSize = fontSize;
  return sprite;
}

async function populateConveyor() {
  for (let index = 0; index < 7; index += 1) {
    spawnConveyorBrainrot(-38 + index * 12);
    await nextFrame();
  }
}

function spawnConveyorBrainrot(z = -42) {
  const catalog = BRAINROT_CATALOG[Math.floor(Math.random() * BRAINROT_CATALOG.length)];
  const rarity = chooseRarity();
  const spec = {
    ...catalog,
    ...rarity,
    bodyColor: catalog.color,
    value: rarity.price,
    rarity: rarity.name,
    x: (Math.random() - 0.5) * 0.65,
    z,
    y: 0.42,
  };
  const model = createBrainrotModel(spec);
  model.position.set(spec.x, spec.y, z);
  scene.add(model);
  const sign = createTextSprite(`${spec.name} · ${spec.rarity} · $${spec.price} · $${spec.income}/s`, "#fffdf1", spec.color);
  sign.position.set(0, 2.8, 0);
  sign.scale.set(4.9, 1.38, 1);
  model.add(sign);
  lootItems.push({
    ...spec,
    group: model,
    sign,
    index: lootItems.length,
    available: true,
    mode: "belt",
    baseY: spec.y,
    age: Math.random() * 3,
    owner: null,
    slot: null,
  });
}

function chooseRarity() {
  const roll = Math.random();
  let threshold = 0;
  for (const rarity of RARITIES) {
    threshold += rarity.chance;
    if (roll <= threshold) return rarity;
  }
  return RARITIES[0];
}

function createBrainrotModel(spec) {
  const group = new THREE.Group();
  const bodyColor = spec.bodyColor ?? spec.color;
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.75, metalness: 0.05 });
  const accentMaterial = new THREE.MeshStandardMaterial({ color: "#fff1d2", roughness: 0.82 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: "#2a2030", roughness: 0.65, metalness: 0.05 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: "#f7c95f", roughness: 0.5, metalness: 0.12 });
  const makeBlock = (parent, size, position, material, rotation = null) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const torsoSize = spec.shape === "cactus" ? [0.66, 0.94, 0.48] : [0.82, 0.68, 0.56];
  makeBlock(group, torsoSize, [0, 0.72, 0], bodyMaterial);
  makeBlock(group, [0.86, 0.12, 0.59], [0, 0.37, 0], accentMaterial);
  makeBlock(group, [0.84, 0.06, 0.57], [0, 1.08, 0], accentMaterial);

  const head = new THREE.Group();
  head.position.set(0, 1.47, 0);
  group.add(head);
  const headWidth = spec.shape === "llama" ? 0.58 : 0.76;
  makeBlock(head, [headWidth, 0.68, 0.62], [0, 0.2, 0], bodyMaterial);
  makeBlock(head, [headWidth + 0.04, 0.08, 0.64], [0, 0.56, 0], accentMaterial);

  const eyeMaterial = spec.shape === "panda"
    ? new THREE.MeshStandardMaterial({ color: "#1a1620", roughness: 0.6 })
    : darkMaterial;
  const eyeWhiteMaterial = new THREE.MeshStandardMaterial({ color: "#fff8f0", roughness: 0.25, metalness: 0.05 });
  for (const side of [-1, 1]) {
    const eyeX = side * headWidth * 0.25;
    makeBlock(head, [0.2, 0.22, 0.08], [eyeX, 0.28, 0.34], eyeWhiteMaterial);
    makeBlock(head, [0.08, 0.13, 0.04], [eyeX, 0.28, 0.40], eyeMaterial);
    makeBlock(head, [0.14, 0.07, 0.045], [side * 0.24, 0.02, 0.34], new THREE.MeshStandardMaterial({ color: "#f29b91", roughness: 0.7 }));
  }
  makeBlock(head, [0.22, 0.06, 0.08], [0, -0.02, 0.35], darkMaterial);
  makeBlock(head, [0.14, 0.03, 0.06], [0, -0.05, 0.37], new THREE.MeshStandardMaterial({ color: "#d97a8e", roughness: 0.6 }));

  const arms = [];
  const legs = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.51, 1.03, 0);
    group.add(arm);
    makeBlock(arm, [0.23, 0.58, 0.26], [0, -0.26, 0], bodyMaterial);
    makeBlock(arm, [0.27, 0.19, 0.28], [0, -0.57, 0.02], accentMaterial);
    arms.push(arm);

    const leg = new THREE.Group();
    leg.position.set(side * 0.22, 0.39, 0);
    group.add(leg);
    makeBlock(leg, [0.27, 0.48, 0.3], [0, -0.22, 0], bodyMaterial);
    makeBlock(leg, [0.34, 0.16, 0.4], [0, -0.48, 0.07], accentMaterial);
    legs.push(leg);

    if (["cat", "rabbit", "panda", "llama"].includes(spec.shape)) {
      const earHeight = spec.shape === "rabbit" || spec.shape === "llama" ? 0.38 : 0.2;
      makeBlock(head, [0.2, earHeight, 0.18], [side * headWidth * 0.39, 0.2 + earHeight * 0.53, 0], bodyMaterial);
      if (spec.shape === "cat") {
        makeBlock(head, [0.1, 0.13, 0.04], [side * headWidth * 0.39, 0.2 + earHeight * 0.53, 0.105], accentMaterial);
      } else if (spec.shape === "panda") {
        makeBlock(head, [0.12, 0.14, 0.05], [side * headWidth * 0.39, 0.2 + earHeight * 0.53, 0.105], darkMaterial);
      }
    } else if (spec.shape === "axolotl") {
      for (let gill = 0; gill < 3; gill += 1) {
        makeBlock(head, [0.22, 0.09, 0.1], [side * (0.42 + gill * 0.04), 0.16 - gill * 0.14, -0.02], accentMaterial);
      }
    }

    if (spec.shape === "cactus") {
      makeBlock(group, [0.22, 0.55, 0.22], [side * 0.49, 0.93, 0], bodyMaterial, [0, 0, side * -0.22]);
    }
  }

  if (spec.shape === "duck" || spec.shape === "chick") {
    makeBlock(head, [0.3, 0.15, 0.25], [0, 0.1, 0.43], trimMaterial);
  } else if (spec.shape === "capybara") {
    makeBlock(head, [0.3, 0.2, 0.24], [0, 0.02, 0.4], new THREE.MeshStandardMaterial({ color: "#8b593f", roughness: 0.8 }));
  } else if (spec.shape === "turtle") {
    makeBlock(group, [0.88, 0.54, 0.42], [0, 0.87, -0.42], new THREE.MeshStandardMaterial({ color: "#367f57", roughness: 0.95 }));
    makeBlock(group, [0.82, 0.1, 0.38], [0, 1.12, -0.42], new THREE.MeshStandardMaterial({ color: "#4a9968", roughness: 0.85 }));
  } else if (spec.shape === "cactus") {
    for (const side of [-1, 1]) {
      makeBlock(head, [0.045, 0.12, 0.045], [side * 0.24, 0.05, 0.33], accentMaterial);
    }
  }

  if (["Raro", "Épico", "Legendario", "Mítico"].includes(spec.rarity)) {
    const glassesMaterial = new THREE.MeshStandardMaterial({ color: "#3a4a66", metalness: 0.4, roughness: 0.25 });
    makeBlock(head, [0.3, 0.12, 0.08], [-0.18, 0.29, 0.42], glassesMaterial);
    makeBlock(head, [0.3, 0.12, 0.08], [0.18, 0.29, 0.42], glassesMaterial);
    makeBlock(head, [0.16, 0.05, 0.07], [0, 0.29, 0.42], glassesMaterial);
  }

  if (["Épico", "Mítico"].includes(spec.rarity)) {
    const wingMaterial = new THREE.MeshStandardMaterial({
      color: spec.rarity === "Mítico" ? "#f8a6e2" : "#f4f1ff",
      roughness: 0.68,
      emissive: spec.rarity === "Mítico" ? "#c466b0" : "#a0a0cc",
      emissiveIntensity: 0.18,
    });
    for (const side of [-1, 1]) {
      for (let feather = 0; feather < 3; feather += 1) {
        makeBlock(
          group,
          [0.28, 0.22, 0.16],
          [side * (0.56 + feather * 0.13), 1.12 - feather * 0.18, -0.37],
          wingMaterial,
          [0, 0, side * -0.24],
        );
      }
    }
  }

  if (["Legendario", "Mítico"].includes(spec.rarity)) {
    makeBlock(head, [0.66, 0.13, 0.38], [0, 0.62, 0], trimMaterial);
    for (const point of [-1, 0, 1]) {
      makeBlock(head, [0.13, 0.23, 0.15], [point * 0.22, 0.78 + (point === 0 ? 0.12 : 0), 0], trimMaterial);
    }
  }

  if (spec.rarity === "Mítico") {
    const haloMaterial = new THREE.MeshStandardMaterial({
      color: "#ffd86b",
      emissive: "#c78028",
      emissiveIntensity: 0.5,
      metalness: 0.5,
      roughness: 0.3,
    });
    for (let segment = 0; segment < 8; segment += 1) {
      const angle = (segment / 8) * Math.PI * 2;
      makeBlock(head, [0.15, 0.13, 0.16], [Math.cos(angle) * 0.56, 1.02, Math.sin(angle) * 0.56], haloMaterial);
    }
    const aura = new THREE.PointLight("#ffd86b", 2, 4, 2);
    aura.position.set(0, 1.5, 0);
    group.add(aura);
  }

  const rarityColor = new THREE.Color(spec.color);
  const rarityGlow = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.025, 6, 32),
    new THREE.MeshBasicMaterial({ color: rarityColor, transparent: true, opacity: 0.5 }),
  );
  rarityGlow.rotation.x = Math.PI / 2;
  rarityGlow.position.y = 0.08;
  group.add(rarityGlow);

  group.userData.bobPhase = Math.random() * Math.PI * 2;
  group.userData.arms = arms;
  group.userData.legs = legs;
  return group;
}

function bindControls() {
  window.addEventListener("keydown", (event) => {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) event.preventDefault();
    if (event.repeat) return;
    audio.start().catch((error) => console.error("No se pudo iniciar el audio:", error));
    if (event.code === "Escape") {
      event.preventDefault();
      keys.clear();
      shopPanel.classList.remove("is-open");
      shopToggle.setAttribute("aria-expanded", "false");
      shopPanel.setAttribute("aria-hidden", "true");
      boxitySdk?.portal?.showMenu(true);
      return;
    }
    keys.add(event.code);
    if (event.code === "Space") jump();
    if (event.code === "KeyE") interact();
  });

  window.addEventListener("keyup", (event) => keys.delete(event.code));
  window.addEventListener("blur", () => keys.clear());
  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    audio.start().catch((error) => console.error("No se pudo iniciar el audio:", error));
    cameraDrag = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!cameraDrag || cameraDrag.pointerId !== event.pointerId) return;
    cameraTargetYaw += (event.clientX - cameraDrag.x) * 0.004 * cameraSensitivity;
    cameraPitch = THREE.MathUtils.clamp(
      cameraPitch + (event.clientY - cameraDrag.y) * 0.003 * cameraSensitivity,
      -0.5,
      0.7,
    );
    cameraDrag.x = event.clientX;
    cameraDrag.y = event.clientY;
  });
  const endCameraDrag = () => {
    cameraDrag = null;
  };
  canvas.addEventListener("pointerup", endCameraDrag);
  canvas.addEventListener("pointercancel", endCameraDrag);
  canvas.addEventListener("lostpointercapture", endCameraDrag);

  for (const button of document.querySelectorAll("[data-key]")) {
    const code = button.dataset.key;
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      audio.start().catch((error) => console.error("No se pudo iniciar el audio:", error));
      keys.add(code);
      button.setPointerCapture(event.pointerId);
    });
    const release = () => keys.delete(code);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
  }

  document.querySelector("#mobile-jump").addEventListener("pointerdown", (event) => {
    event.preventDefault();
    audio.start().catch((error) => console.error("No se pudo iniciar el audio:", error));
    jump();
  });
  document.querySelector("#mobile-interact").addEventListener("pointerdown", (event) => {
    event.preventDefault();
    audio.start().catch((error) => console.error("No se pudo iniciar el audio:", error));
    interact();
  });
  for (const button of document.querySelectorAll("[data-upgrade]")) {
    button.addEventListener("click", () => {
      purchaseUpgrade(button.dataset.upgrade);
      shopPanel.classList.remove("is-open");
      shopToggle.setAttribute("aria-expanded", "false");
      shopPanel.setAttribute("aria-hidden", "true");
    });
  }
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate() {
  const delta = Math.min(clock.getDelta(), 0.035);
  const now = performance.now() / 1000;
  if (worldState.paused) {
    renderer.render(scene, camera);
    return;
  }
  movePlayer(delta);
  animateLoot(now, delta);
  updateIncome(delta);
  animateAvatar(now);
  updateEmote(now);
  avatar.updateMatrixWorld(true);
  updateFollowAccessories();
  checkLootProximity();
  updateCamera(delta);
  updateLabels();
  updateHud(now);
  renderer.render(scene, camera);
}

function movePlayer(delta) {
  const forward = Number(keys.has("KeyW") || keys.has("ArrowUp")) - Number(keys.has("KeyS") || keys.has("ArrowDown"));
  const right = Number(keys.has("KeyD") || keys.has("ArrowRight")) - Number(keys.has("KeyA") || keys.has("ArrowLeft"));
  const moving = forward !== 0 || right !== 0;
  if (moving) {
    stopEmote();
    const length = Math.hypot(forward, right);
    const moveForward = forward / length;
    const moveRight = right / length;
    const forwardX = Math.sin(cameraYaw);
    const forwardZ = -Math.cos(cameraYaw);
    const rightX = Math.cos(cameraYaw);
    const rightZ = Math.sin(cameraYaw);
    const moveX = forwardX * moveForward + rightX * moveRight;
    const moveZ = forwardZ * moveForward + rightZ * moveRight;
    player.x = THREE.MathUtils.clamp(player.x + moveX * player.speed * delta, -34, 34);
    player.z = THREE.MathUtils.clamp(player.z + moveZ * player.speed * delta, -44, 44);
    player.facing = Math.atan2(moveX, moveZ);
  }

  player.vy -= 22 * delta;
  player.y = Math.max(0, player.y + player.vy * delta);
  if (player.y === 0) {
    player.vy = 0;
    player.grounded = true;
  }
}

function isWithinPlatform(platform, x, z) {
  return x >= platform.minX - 0.18 && x <= platform.maxX + 0.18 && z >= platform.minZ - 0.18 && z <= platform.maxZ + 0.18;
}

function findPlatform(x, z, y) {
  return platforms.find((platform) => Math.abs(platform.y - y) < 0.08 && isWithinPlatform(platform, x, z));
}

function jump() {
  if (!player.grounded) return;
  player.vy = player.jump + player.upgradeJump;
  player.grounded = false;
  audio.playTone(330, 0.1);
}

function interact() {
  const now = performance.now() / 1000;
  if (now - worldState.lastInteraction < 0.25) return;
  worldState.lastInteraction = now;

  if (worldState.closestLoot?.mode === "belt") {
    purchaseBrainrot(worldState.closestLoot);
    return;
  }

  if (worldState.closestLoot?.mode === "owned" && worldState.closestLoot.owner !== worldState.homeBase) {
    stealBrainrot(worldState.closestLoot);
    return;
  }

  if (worldState.nearBase && player.carried.length > 0) {
    depositLoot();
    return;
  }

  if (worldState.nearBank) {
    collectBank();
    return;
  }

  if (worldState.nearestBase && worldState.nearestBase !== worldState.homeBase) {
    showToast("Base libre para otro jugador");
  } else {
    showToast("Acércate a la pasarela o a una base");
  }
}

function checkLootProximity() {
  worldState.closestLoot = null;
  worldState.nearestBase = null;
  let closestDistance = 3.2;
  for (const item of lootItems) {
    if (!item.available || !["belt", "owned"].includes(item.mode)) continue;
    if (item.mode === "owned" && item.owner === worldState.homeBase) continue;
    const distance = Math.hypot(player.x - item.x, player.z - item.z);
    if (distance < closestDistance && Math.abs(player.y - item.y) < 2.5) {
      closestDistance = distance;
      worldState.closestLoot = item;
    }
  }

  let baseDistance = Infinity;
  for (const base of bases) {
    const distance = Math.hypot(player.x - base.x, player.z - base.z);
    if (distance < baseDistance) {
      baseDistance = distance;
      worldState.nearestBase = base;
    }
  }
  worldState.nearBase = Boolean(worldState.homeBase && Math.hypot(player.x - worldState.homeBase.x, player.z - worldState.homeBase.z) < 7);
  const bankX = (worldState.homeBase?.x ?? 0) - (worldState.homeBase?.side ?? 1) * 4.05;
  const bankZ = worldState.homeBase?.z ?? 0;
  worldState.nearBank = Math.hypot(player.x - bankX, player.z - bankZ) < 2.5;
  const canInteract = Boolean(worldState.closestLoot || (worldState.nearBase && player.carried.length) || worldState.nearBank);
  prompt.classList.toggle("is-visible", canInteract);
  const promptText = worldState.closestLoot?.mode === "belt"
    ? `Comprar ${worldState.closestLoot.name} · $${worldState.closestLoot.price}`
    : worldState.closestLoot?.mode === "owned"
      ? `Robar ${worldState.closestLoot.name}`
      : worldState.nearBase && player.carried.length
        ? "Colocar en un pedestal"
        : worldState.nearBank
          ? `Recoger $${Math.floor(worldState.homeBase.accrued)}`
          : "Interactuar";
  prompt.querySelector("span").textContent = promptText;
}

function purchaseBrainrot(item) {
  const base = worldState.homeBase;
  const slot = base.slots.find((candidate) => !candidate.brainrot);
  if (!slot) {
    showToast("No tienes pedestales libres");
    return false;
  }
  if (player.cash < item.price) {
    showToast(`Necesitas $${item.price} para comprarlo`);
    return false;
  }
  player.cash -= item.price;
  showToast(`Compraste ${item.name}`);
  audio.playTone(523, 0.14);
  item.mode = "delivery";
  item.owner = base;
  item.slot = slot;
  item.available = false;
  item.group.remove(item.sign);
  disposeObject(item.sign);
  slot.brainrot = item;
  return true;
}

function stealBrainrot(item) {
  if (player.carried.length >= player.capacity) {
    showToast("Las manos están ocupadas: vuelve a tu base");
    return;
  }
  const slot = item.slot;
  if (slot) {
    slot.brainrot = null;
    slot.model = null;
  }
  scene.remove(item.group);
  disposeObject(item.group);
  player.carried.push({ ...item, group: undefined, slot: undefined, owner: undefined, wasStolen: true });
  syncCarriedModels();
  item.available = false;
  item.mode = "stolen";
  showToast(`${item.name} robado`);
  audio.playTone(760, 0.13);
}

function depositLoot() {
  const slot = worldState.homeBase.slots.find((candidate) => !candidate.brainrot);
  if (!slot) {
    showToast("No tienes pedestales libres");
    return;
  }
  const stolen = player.carried.shift();
  const item = {
    ...stolen,
    group: createBrainrotModel(stolen),
    index: lootItems.length,
    mode: "owned",
    available: true,
    owner: worldState.homeBase,
    slot,
    age: 0,
    x: slot.x,
    y: slot.y,
    z: slot.z,
  };
  item.group.position.set(slot.x, slot.y, slot.z);
  scene.add(item.group);
  slot.brainrot = item;
  slot.model = item.group;
  lootItems.push(item);
  if (stolen.wasStolen) {
    worldState.totalStolen = (worldState.totalStolen ?? 0) + 1;
    void submitLeaderboardScore(1);
  }
  syncCarriedModels();
  updateHud();
  showToast(`${item.name} instalado`);
  audio.playTone(659, 0.18);
}

function collectBank() {
  const amount = Math.floor(worldState.homeBase.accrued);
  if (!amount) {
    showToast("Tus Brainrots aún están ahorrando");
    return;
  }
  worldState.homeBase.accrued -= amount;
  player.cash += amount;
  updateHud();
  showToast(`¡Recogiste $${amount}!`);
  audio.playTone(784, 0.18);
}

async function submitLeaderboardScore(count) {
  try {
    const result = await Legion.SDK.leaderboard.submit("brainrots-stolen", count);
    if (result?.results?.some((entry) => entry.improved)) showToast("¡Nuevo récord de brainrots!");
  } catch (error) {
    console.error("No se pudo enviar el resultado al leaderboard:", error);
  }
}

function syncCarriedModels() {
  for (const model of carriedModels) {
    avatar.remove(model);
    disposeObject(model);
  }
  carriedModels.length = 0;

  player.carried.slice(-3).forEach((item, index) => {
    const model = createBrainrotModel(item);
    model.scale.setScalar(0.42);
    model.position.set((index - 0.5) * 0.5, 1.5 + index * 0.05, 0.2);
    avatar.add(model);
    carriedModels.push(model);
  });
}

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose();
    if (!child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      material.map?.dispose();
      material.dispose();
    }
  });
}

function purchaseUpgrade(type) {
  const options = {
    speed: { cost: 35, limit: 3, name: "Impulso" },
    jump: { cost: 45, limit: 3, name: "Salto lunar" },
    capacity: { cost: 60, limit: 2, name: "Mochila XL" },
  };
  const upgrade = options[type];
  if (!upgrade) return;
  if (player.upgrades[type] >= upgrade.limit) {
    showToast(`${upgrade.name}: nivel máximo`);
    return;
  }
  if (player.cash < upgrade.cost) {
    showToast(`Necesitas ${upgrade.cost} créditos`);
    return;
  }
  player.cash -= upgrade.cost;
  player.upgrades[type] += 1;
  if (type === "speed") player.speed += 0.8;
  if (type === "jump") player.upgradeJump = (player.upgradeJump ?? 0) + 1.1;
  if (type === "capacity") player.capacity += 1;
  updateHud();
  showToast(`${upgrade.name} mejorado`);
}

function updateIncome(delta) {
  for (const base of bases) {
    const income = base.slots.reduce((sum, slot) => sum + (slot.brainrot?.income ?? 0), 0);
    base.accrued += income * delta;
    base.shieldTimeLeft -= delta;
    if (base.shieldTimeLeft <= 0) base.shieldTimeLeft += 60;
    const shieldSecond = Math.ceil(base.shieldTimeLeft);
    if (shieldSecond !== base.lastShieldSecond) {
      base.lastShieldSecond = shieldSecond;
      const minutes = Math.floor(shieldSecond / 60);
      const seconds = shieldSecond % 60;
      updateTextSprite(
        base.shieldDisplay,
        `ESCUDO ${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
      );
    }
  }
}

function animateLoot(now, delta) {
  if (worldState.lane?.userData.stripes) {
    for (const stripe of worldState.lane.userData.stripes) {
      stripe.position.z = ((stripe.userData.offset + now * 4) % 4.8) - 2.4;
    }
  }
  for (const item of lootItems) {
    if (item.mode === "belt") {
      item.z += 4.2 * delta;
      if (item.z > 42) {
        item.z = -42;
        const catalog = BRAINROT_CATALOG[Math.floor(Math.random() * BRAINROT_CATALOG.length)];
        const rarity = chooseRarity();
        Object.assign(item, catalog, rarity, { bodyColor: catalog.color, value: rarity.price, rarity: rarity.name });
        scene.remove(item.group);
        disposeObject(item.group);
        item.group = createBrainrotModel(item);
        item.group.position.set(item.x, item.baseY, item.z);
        scene.add(item.group);
        item.sign = createTextSprite(`${item.name} · ${item.rarity} · $${item.price} · $${item.income}/s`, "#fffdf1", item.color);
        item.sign.position.set(0, 2.8, 0);
        item.sign.scale.set(4.9, 1.38, 1);
        item.group.add(item.sign);
      }
      item.x = Math.sin(now * 0.8 + item.index) * 0.25;
      item.group.position.set(item.x, item.baseY + Math.sin(now * 3 + item.index) * 0.1, item.z);
      item.group.rotation.y = Math.PI + Math.sin(now * 0.8) * 0.08;
      item.group.rotation.z = Math.sin(now * 2 + item.index) * 0.035;
    } else if (item.mode === "delivery") {
      const dx = item.slot.x - item.x;
      const dz = item.slot.z - item.z;
      const distance = Math.hypot(dx, dz);
      const step = Math.min(distance, 3.2 * delta);
      item.x += (dx / (distance || 1)) * step;
      item.z += (dz / (distance || 1)) * step;
      item.group.position.set(item.x, item.y + Math.sin(now * 8) * 0.04, item.z);
      item.group.rotation.y = Math.atan2(dx, dz);
      if (distance < 0.25) {
        item.mode = "owned";
        item.available = true;
        item.slot.model = item.group;
      }
    } else if (item.mode === "owned" && item.group.visible) {
      item.group.position.y = item.y + Math.sin(now * 2 + item.index) * 0.08;
      item.group.rotation.y = Math.sin(now * 0.5 + item.index) * 0.08;
    }
    const gaitPhase = now * (item.mode === "belt" || item.mode === "delivery" ? 7 : 1.7) + item.group.userData.bobPhase;
    const gaitAmount = item.mode === "belt" || item.mode === "delivery" ? 0.42 : 0.06;
    item.group.userData.legs?.forEach((leg, index) => {
      leg.rotation.x = Math.sin(gaitPhase + index * Math.PI) * gaitAmount;
    });
    item.group.userData.arms?.forEach((arm, index) => {
      arm.rotation.x = Math.sin(gaitPhase + (index + 1) * Math.PI) * gaitAmount * 0.72;
    });
    if (item.group.visible) {
      const scale = worldState.closestLoot === item ? 1.12 + Math.sin(now * 8) * 0.035 : 1;
      if (item.mode !== "owned") item.group.scale.setScalar(scale);
    }
  }
  for (const base of bases) {
    base.bank.material.emissiveIntensity = base === worldState.homeBase && base.accrued >= 1 ? 1 : 0.55;
  }
}

function animateAvatar(now) {
  const isMoving = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].some((key) => keys.has(key));
  avatar.position.set(player.x, player.y, player.z);
  avatar.rotation.y = player.facing;
  if (isMoving && player.grounded) {
    avatar.position.y += Math.abs(Math.sin(now * 11)) * 0.08;
    avatar.rotation.z = Math.sin(now * 11) * 0.035;
  } else {
    avatar.rotation.z = 0;
  }
  carriedModels.forEach((model, index) => {
    model.rotation.y = Math.sin(now * 2 + index) * 0.3;
  });
}

function updateCamera(delta) {
  cameraYaw += (cameraTargetYaw - cameraYaw) * (1 - Math.exp(-10 * delta));
  const distance = 6.8;
  const horizontalDistance = Math.cos(cameraPitch) * distance;
  const target = new THREE.Vector3(
    player.x + Math.sin(cameraYaw) * horizontalDistance,
    player.y + 2.4 + Math.sin(cameraPitch) * distance,
    player.z + Math.cos(cameraYaw) * horizontalDistance,
  );
  const follow = 1 - Math.pow(0.0025, delta);
  camera.position.lerp(target, follow);
  const look = new THREE.Vector3(
    player.x - Math.sin(cameraYaw) * 1.4,
    player.y + 1.5,
    player.z - Math.cos(cameraYaw) * 1.4,
  );
  camera.lookAt(look);
}

function updateTextSprite(sprite, text) {
  const labelCanvas = sprite.userData.canvas;
  const context = labelCanvas.getContext("2d");
  context.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
  context.fillStyle = sprite.userData.background;
  context.beginPath();
  context.roundRect(8, 8, 496, 128, 28);
  context.fill();
  context.strokeStyle = "rgba(255,255,255,.8)";
  context.lineWidth = 6;
  context.stroke();
  context.fillStyle = sprite.userData.textColor;
  context.font = `bold ${sprite.userData.fontSize}px Manrope, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 256, 72, 470);
  sprite.userData.canvasTexture.needsUpdate = true;
}

function updateLabels() {
  const homeBase = worldState.homeBase;
  if (homeBase) {
    placeLabel(document.querySelector(".label-base"), new THREE.Vector3(homeBase.x, 5, homeBase.z - 4.7));
  }
  placeLabel(document.querySelector(".label-vault"), new THREE.Vector3(0, 2.5, -12));
}

function placeLabel(element, position) {
  const vector = position.project(camera);
  if (vector.z > 1) {
    element.style.opacity = "0";
    return;
  }
  const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-vector.y * 0.5 + 0.5) * window.innerHeight;
  element.style.left = `${x}px`;
  element.style.top = `${y}px`;
  element.style.right = "auto";
  element.style.bottom = "auto";
  element.style.opacity = "1";
}

function updateHud(now = performance.now() / 1000) {
  moneyValue.textContent = `$${player.cash}`;
  shopMoney.textContent = `$${player.cash}`;
  const homeIncome = worldState.homeBase?.slots.reduce((sum, slot) => sum + (slot.brainrot?.income ?? 0), 0) ?? 0;
  incomeValue.innerHTML = `$${Math.floor(homeIncome)} <small>/s</small>`;

  for (const button of document.querySelectorAll("[data-upgrade]")) {
    const type = button.dataset.upgrade;
    const costs = { speed: 35, jump: 45, capacity: 60 };
    const limits = { speed: 3, jump: 3, capacity: 2 };
    const atLimit = player.upgrades[type] >= limits[type];
    button.disabled = atLimit || player.cash < costs[type];
    button.querySelector(".upgrade-cost").textContent = atLimit ? "MAX" : `$${costs[type]}`;
  }

  if (worldState.toastUntil <= now && toast.classList.contains("is-visible")) {
    toast.classList.remove("is-visible");
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  worldState.toastUntil = performance.now() / 1000 + 2.2;
}
