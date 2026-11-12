import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { GameAudio } from "./audio.js";
import "./styles.css";

const GAME_SLUG = "robar-el-brainrot";
const canvas = document.querySelector("#game-canvas");
const playerIdentity = document.querySelector("#player-identity");
const moneyValue = document.querySelector("#money-value");
const shopMoney = document.querySelector("#shop-money");
const bagValue = document.querySelector("#bag-value");
const bagDetail = document.querySelector("#bag-detail");
const missionTitle = document.querySelector("#mission-title");
const missionDetail = document.querySelector("#mission-detail");
const missionProgress = document.querySelector("#mission-progress");
const shieldState = document.querySelector("#shield-state");
const shieldTimer = document.querySelector("#shield-timer");
const shieldMeter = document.querySelector("#shield-meter");
const shieldButton = document.querySelector("#shield-button");
const prompt = document.querySelector("#interaction-prompt");
const toast = document.querySelector("#toast");
const feedMessages = document.querySelector("#feed-messages");
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

const hemiLight = new THREE.HemisphereLight("#e7faff", "#609356", 2.6);
scene.add(hemiLight);

const moonLight = new THREE.DirectionalLight("#fff5d6", 3.2);
moonLight.position.set(-24, 38, 18);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(1024, 1024);
moonLight.shadow.camera.left = -50;
moonLight.shadow.camera.right = 50;
moonLight.shadow.camera.top = 50;
moonLight.shadow.camera.bottom = -50;
scene.add(moonLight);

const platforms = [];
const lootItems = [];
const bases = [];
const bots = [];
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

const shield = {
  activeUntil: 0,
  cooldownUntil: 0,
  duration: 10,
  cooldown: 22,
};

const worldState = {
  startAt: 0,
  nextRaidAt: 12,
  lastInteraction: 0,
  toastUntil: 0,
  paused: false,
  closestLoot: null,
  nearBase: false,
  nearestBase: null,
  homeBase: null,
  currentAction: "idle",
  laneDirection: 1,
  lastPunchAt: 0,
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
const laserShield = createLaserShield();
scene.add(laserShield);
laserShield.visible = false;

bindControls();
resize();
window.addEventListener("resize", resize);
updateHud();
addFeed("Tu base está lista. ¡Sal a explorar!", false);

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

  worldState.startAt = performance.now() / 1000;
  worldState.nextRaidAt = performance.now() / 1000 + 12;
  addFeed("Expedición iniciada. Recoge hallazgos y vuelve a tu base.", false);
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
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: "#5ce4cf", roughness: 0.56, metalness: 0.08 });
  const suit = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.95, 12), bodyMaterial);
  suit.position.y = 0.64;
  suit.castShadow = true;
  group.add(suit);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 20, 16),
    new THREE.MeshStandardMaterial({ color: "#f1d8c6", roughness: 0.78 }),
  );
  head.position.y = 1.36;
  head.castShadow = true;
  group.add(head);

  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshStandardMaterial({ color: "#8fffea", emissive: "#31cbb2", emissiveIntensity: 0.7, metalness: 0.38, roughness: 0.22 }),
  );
  visor.position.set(0, 1.43, 0.15);
  visor.rotation.x = -0.22;
  group.add(visor);

  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.34, 3, 8), bodyMaterial);
    leg.position.set(side * 0.2, 0.2, 0);
    group.add(leg);
  }

  const backpack = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.48, 0.25),
    new THREE.MeshStandardMaterial({ color: "#987cff", emissive: "#5e43c4", emissiveIntensity: 0.5, roughness: 0.38 }),
  );
  backpack.position.set(0, 0.74, -0.35);
  group.add(backpack);

  return group;
}

function createLaserShield() {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: "#57ffe0", transparent: true, opacity: 0.56 });
  const beams = [
    { position: [0, 1.1, -4.7], size: [9.4, 1.8, 0.045] },
    { position: [0, 1.1, 4.7], size: [9.4, 1.8, 0.045] },
    { position: [-4.7, 1.1, 0], size: [0.045, 1.8, 9.4] },
    { position: [4.7, 1.1, 0], size: [0.045, 1.8, 9.4] },
  ];
  for (const beam of beams) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...beam.size), material.clone());
    mesh.position.set(...beam.position);
    group.add(mesh);
  }

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(4.65, 0.045, 8, 64),
    new THREE.MeshBasicMaterial({ color: "#78ffea", transparent: true, opacity: 0.8 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.12;
  group.add(ring);
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
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({ color: "#82ce69", roughness: 1 }),
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

  const lane = new THREE.Group();
  const belt = new THREE.Mesh(
    new THREE.BoxGeometry(5.2, 0.24, 86),
    new THREE.MeshStandardMaterial({ color: "#d98a50", roughness: 0.8 }),
  );
  belt.position.y = 0.12;
  belt.receiveShadow = true;
  lane.add(belt);
  const beltTop = new THREE.Mesh(
    new THREE.BoxGeometry(4.65, 0.08, 85.7),
    new THREE.MeshStandardMaterial({ color: "#f7c879", roughness: 0.65 }),
  );
  beltTop.position.y = 0.28;
  lane.add(beltTop);
  for (const x of [-2.7, 2.7]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.32, 86),
      new THREE.MeshStandardMaterial({ color: "#fff2c7", roughness: 0.5 }),
    );
    rail.position.set(x, 0.27, 0);
    lane.add(rail);
  }
  for (let index = 0; index < 18; index += 1) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.03, 1.2),
      new THREE.MeshStandardMaterial({ color: "#fff7e2", roughness: 0.55 }),
    );
    stripe.position.set(0, 0.34, -41 + index * 4.8);
    stripe.userData.offset = index * 4.8;
    lane.add(stripe);
  }
  lane.userData.stripes = lane.children.filter((child) => child.userData.offset !== undefined);
  scene.add(lane);
  worldState.lane = lane;

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
      else bots.push(createBot(base, baseIndex));
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
    new THREE.BoxGeometry(12, 0.42, 12),
    new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.85 }),
  );
  foundation.position.y = 0.05;
  foundation.castShadow = true;
  foundation.receiveShadow = true;
  group.add(foundation);
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(11.4, 0.12, 11.4),
    new THREE.MeshStandardMaterial({ color: "#fff4d8", roughness: 0.9 }),
  );
  floor.position.y = 0.31;
  group.add(floor);

  const house = new THREE.Mesh(
    new THREE.BoxGeometry(4.1, 2.5, 4.1),
    new THREE.MeshStandardMaterial({ color: "#fffaf0", roughness: 0.88 }),
  );
  house.position.set(spec.side * -3.5, 1.6, 0);
  house.castShadow = true;
  group.add(house);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(3.2, 2.4, 4),
    new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.8 }),
  );
  roof.position.set(spec.side * -3.5, 3.8, 0);
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);

  const slots = [];
  for (let index = 0; index < 4; index += 1) {
    const row = Math.floor(index / 2);
    const column = index % 2;
    const x = spec.side * 1.8;
    const z = (row === 0 ? -1 : 1) * (1.8 + column * 2.1);
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.88, 1.02, 0.48, 10),
      new THREE.MeshStandardMaterial({ color: "#f2c56b", roughness: 0.72 }),
    );
    pedestal.position.set(x, 0.57, z);
    group.add(pedestal);
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(0.78, 0.78, 0.12, 12),
      new THREE.MeshStandardMaterial({ color: "#fff3c9", roughness: 0.55 }),
    );
    top.position.set(x, 0.87, z);
    group.add(top);
    slots.push({ x: spec.x + x, y: 0.96, z: spec.z + z, brainrot: null, model: null });
  }

  const bank = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.25, 0.16, 12),
    new THREE.MeshStandardMaterial({ color: "#76c96f", roughness: 0.65 }),
  );
  bank.position.set(0, 0.43, spec.side * 4.35);
  group.add(bank);
  const bankMark = new THREE.Mesh(
    new THREE.TorusGeometry(0.6, 0.07, 6, 16),
    new THREE.MeshStandardMaterial({ color: "#fff7d1", roughness: 0.4 }),
  );
  bankMark.rotation.x = Math.PI / 2;
  bankMark.position.set(0, 0.55, spec.side * 4.35);
  group.add(bankMark);

  const doorGroup = new THREE.Group();
  for (const offset of [-2.1, 2.1]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.24, 2.3, 8),
      new THREE.MeshStandardMaterial({ color: "#fff1c1", roughness: 0.5 }),
    );
    post.position.set(offset, 1.45, spec.side * 5.35);
    doorGroup.add(post);
  }
  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 0.12, 0.12),
    new THREE.MeshStandardMaterial({ color: "#ff667a", roughness: 0.4 }),
  );
  beam.position.set(0, 1.55, spec.side * 5.35);
  doorGroup.add(beam);
  group.add(doorGroup);

  const label = createTextSprite(spec.isPlayer ? "TU BASE" : `BASE ${spec.id + 1}`, "#ffffff", spec.color);
  label.position.set(0, 5.8, -4.7);
  label.scale.set(5.4, 1.25, 1);
  group.add(label);

  const platform = { minX: spec.x - 6, maxX: spec.x + 6, minZ: spec.z - 6, maxZ: spec.z + 6, y: 0 };
  platforms.push(platform);
  const base = { ...spec, group, slots, bank, doorGroup, accrued: 0, shieldUntil: 0, platform, bot: null };
  if (!spec.isPlayer) {
    base.botModel = createBotModel(spec.color);
    base.botModel.position.set(spec.side * -4.6, 0.38, 0);
    group.add(base.botModel);
  }
  return base;
}

function createBot(base, index) {
  const bot = {
    id: index,
    base,
    x: base.x,
    z: base.z,
    speed: 2 + (index % 3) * 0.25,
    nextAction: 8 + index * 2.2,
    target: null,
    mode: "idle",
    cooldown: 0,
  };
  base.bot = bot;
  return bot;
}

function createBotModel(color) {
  const bot = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.42, 0.72, 3, 8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 }),
  );
  body.position.y = 0.75;
  body.castShadow = true;
  bot.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.43, 12, 10),
    new THREE.MeshStandardMaterial({ color: "#ffdab5", roughness: 0.92 }),
  );
  head.position.y = 1.55;
  bot.add(head);
  const eyes = new THREE.MeshBasicMaterial({ color: "#3d382f" });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), eyes);
    eye.position.set(side * 0.14, 1.62, 0.37);
    bot.add(eye);
  }
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.46, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: "#fff0a8", roughness: 0.8 }),
  );
  cap.position.y = 1.8;
  bot.add(cap);
  return bot;
}

function createTextSprite(text, textColor = "#fff", background = "#785c47") {
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
  context.font = "bold 42px Manrope, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 256, 72, 470);
  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.userData.canvasTexture = texture;
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
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.86 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.58, 12, 10), bodyMaterial);
  body.scale.set(1.15, 0.9, 0.95);
  if (["capybara", "panda", "cat", "turtle"].includes(spec.shape)) body.scale.set(1.25, 0.82, 0.9);
  if (["duck", "chick"].includes(spec.shape)) body.scale.set(0.9, 1.05, 0.92);
  if (spec.shape === "cactus") body.scale.set(0.65, 1.3, 0.65);
  if (spec.shape === "llama" || spec.shape === "rabbit") body.scale.set(0.82, 1.25, 0.8);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: spec.shape === "panda" ? "#292929" : "#443b35" });
  const appendageMaterial = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.9 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), eyeMaterial);
    eye.position.set(side * 0.2, 0.78, 0.48);
    group.add(eye);
    const cheek = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 6),
      new THREE.MeshStandardMaterial({ color: "#ffb0a5", roughness: 1 }),
    );
    cheek.position.set(side * 0.31, 0.55, 0.42);
    group.add(cheek);
    if (["cat", "rabbit", "duck", "chick", "panda", "axolotl"].includes(spec.shape)) {
      const earHeight = spec.shape === "rabbit" ? 0.58 : 0.3;
      const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, earHeight, 3, 6), appendageMaterial);
      ear.position.set(side * 0.34, spec.shape === "rabbit" ? 1.35 : 1.05, 0);
      ear.rotation.z = side * -0.22;
      group.add(ear);
    }
    if (spec.shape === "cactus") {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.4, 3, 6), appendageMaterial);
      arm.position.set(side * 0.56, 0.7, 0);
      arm.rotation.z = side * 0.9;
      group.add(arm);
    }
    const foot = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 8, 6),
      new THREE.MeshStandardMaterial({ color: "#f2bf75", roughness: 0.9 }),
    );
    foot.scale.set(1.2, 0.55, 1.4);
    foot.position.set(side * 0.3, 0.12, 0.2);
    group.add(foot);
  }
  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 8, 6),
    new THREE.MeshStandardMaterial({ color: "#ff8f78", roughness: 0.8 }),
  );
  nose.position.set(0, 0.62, 0.57);
  group.add(nose);
  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(0.12, 0.025, 5, 12, Math.PI),
    new THREE.MeshStandardMaterial({ color: "#714c43", roughness: 0.9 }),
  );
  smile.position.set(0, 0.47, 0.53);
  smile.rotation.z = Math.PI;
  group.add(smile);
  if (spec.shape === "turtle") {
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(0.56, 10, 8),
      new THREE.MeshStandardMaterial({ color: "#367f57", roughness: 0.98 }),
    );
    shell.scale.set(1, 0.58, 1);
    shell.position.set(0, 0.85, -0.16);
    group.add(shell);
  }
  group.userData.bobPhase = Math.random() * Math.PI * 2;
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
      boxitySdk?.portal?.showMenu(true);
      return;
    }
    keys.add(event.code);
    if (event.code === "Space") jump();
    if (event.code === "KeyE") interact();
    if (event.code === "KeyQ") activateShield();
    if (event.code === "KeyF") punchNearestBot();
  });

  window.addEventListener("keyup", (event) => keys.delete(event.code));
  window.addEventListener("blur", () => keys.clear());
  canvas.addEventListener("pointerdown", (event) => {
    audio.start().catch((error) => console.error("No se pudo iniciar el audio:", error));
    cameraDrag = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!cameraDrag || cameraDrag.pointerId !== event.pointerId) return;
    cameraYaw += (event.clientX - cameraDrag.x) * 0.004 * cameraSensitivity;
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
  document.querySelector("#mobile-punch").addEventListener("pointerdown", (event) => {
    event.preventDefault();
    punchNearestBot();
  });
  shieldButton.addEventListener("click", activateShield);

  for (const button of document.querySelectorAll("[data-upgrade]")) {
    button.addEventListener("click", () => purchaseUpgrade(button.dataset.upgrade));
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
  updateIncome(delta, now);
  checkRaid(now);
  animateAvatar(now);
  updateEmote(now);
  avatar.updateMatrixWorld(true);
  updateFollowAccessories();
  updateShield(now);
  checkLootProximity(now);
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

function punchNearestBot() {
  const now = performance.now() / 1000;
  if (now - worldState.lastPunchAt < 0.65) return;
  worldState.lastPunchAt = now;
  const target = bots
    .map((bot) => ({ bot, distance: Math.hypot(player.x - bot.x, player.z - bot.z) }))
    .filter(({ distance }) => distance < 3)
    .sort((a, b) => a.distance - b.distance)[0]?.bot;
  if (!target) {
    showToast("No hay ningún bot cerca para empujar");
    return;
  }
  if (target.mode === "escaping" && target.target) {
    const brainrot = target.target;
    const slot = brainrot.slot;
    if (slot && !slot.brainrot) {
      brainrot.mode = "owned";
      brainrot.available = true;
      brainrot.group.visible = true;
      brainrot.x = slot.x;
      brainrot.y = slot.y;
      brainrot.z = slot.z;
      brainrot.group.position.set(slot.x, slot.y, slot.z);
      slot.brainrot = brainrot;
      slot.model = brainrot.group;
    }
  }
  target.mode = "idle";
  target.target = null;
  target.x += Math.sign(target.x - player.x || 1) * 2.8;
  target.z += Math.sign(target.z - player.z || 1) * 2.8;
  target.base.botModel.rotation.z = -0.22;
  setTimeout(() => {
    if (target.base.botModel) target.base.botModel.rotation.z = 0;
  }, 220);
  target.nextAction = now + 5;
  showToast("¡Empujón! El rival retrocede");
  audio.playTone(190, 0.11, "triangle");
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
    showToast(worldState.nearestBase.shieldUntil > performance.now() / 1000 ? "La puerta está protegida" : "Busca un Brainrot libre para robar");
  } else {
    showToast("Acércate a la pasarela o a una base");
  }
}

function checkLootProximity(now) {
  worldState.closestLoot = null;
  worldState.nearestBase = null;
  let closestDistance = 3.2;
  for (const item of lootItems) {
    if (!item.available || !["belt", "owned"].includes(item.mode)) continue;
    if (item.reservedBy?.target === item) continue;
    if (item.mode === "owned" && (item.owner === worldState.homeBase || item.owner?.shieldUntil > now)) continue;
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
  const bankX = worldState.homeBase?.x ?? 0;
  const bankZ = (worldState.homeBase?.z ?? 0) + (worldState.homeBase?.side ?? 1) * 4.35;
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

function purchaseBrainrot(item, buyer = worldState.homeBase) {
  const base = buyer ?? worldState.homeBase;
  const slot = base.slots.find((candidate) => !candidate.brainrot);
  if (!slot) {
    if (base === worldState.homeBase) showToast("No tienes pedestales libres");
    return false;
  }
  if (base === worldState.homeBase && player.cash < item.price) {
    showToast(`Necesitas $${item.price} para comprarlo`);
    return false;
  }
  if (base === worldState.homeBase) {
    player.cash -= item.price;
    showToast(`${item.name} camina hacia tu base`);
    addFeed(`Compraste ${item.name} (${item.rarity}).`, false);
    audio.playTone(523, 0.14);
  } else {
    base.bot.wallet = (base.bot.wallet ?? 220) - item.price;
  }
  item.mode = "delivery";
  item.owner = base;
  item.slot = slot;
  item.available = false;
  item.group.remove(item.sign);
  slot.brainrot = item;
  if (base.bot) base.bot.mode = "return";
  return true;
}

function stealBrainrot(item) {
  if (player.carried.length >= player.capacity) {
    showToast("Las manos están ocupadas: vuelve a tu base");
    return;
  }
  if (item.owner?.shieldUntil > performance.now() / 1000) {
    showToast("La puerta láser está activa");
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
  addFeed(`¡Robaste ${item.name}! Llévalo a tu base.`, false);
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
  updateMission();
  addFeed(`${item.name} ocupa un pedestal y genera $${item.income}/s.`, false);
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
    if (!child.isMesh) return;
    child.geometry.dispose();
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
    else child.material.dispose();
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
  addFeed(`${upgrade.name} mejorado al nivel ${player.upgrades[type]}.`, false);
}

function activateShield() {
  const now = performance.now() / 1000;
  if (now < shield.activeUntil) {
    showToast("El escudo ya está activo");
    return;
  }
  if (now < shield.cooldownUntil) {
    showToast(`Escudo recargando: ${Math.ceil(shield.cooldownUntil - now)}s`);
    return;
  }
  shield.activeUntil = now + shield.duration;
  shield.cooldownUntil = now + shield.duration + shield.cooldown;
  worldState.homeBase.shieldUntil = shield.activeUntil;
  updateShieldVisual(worldState.homeBase, true);
  addFeed("Puerta temporal activa: tu base está protegida.", false);
  showToast("Puerta segura activada");
}

function updateShield(now) {
  const active = now < shield.activeUntil;
  if (worldState.homeBase) {
    worldState.homeBase.shieldUntil = shield.activeUntil;
    updateShieldVisual(worldState.homeBase, active);
  }

  if (active) {
    shieldState.textContent = "Puerta protegida";
    shieldTimer.textContent = `Se desactiva en ${Math.ceil(shield.activeUntil - now)}s`;
    shieldMeter.style.width = `${Math.max(0, ((shield.activeUntil - now) / shield.duration) * 100)}%`;
    shieldButton.disabled = true;
    shieldButton.innerHTML = `ACTIVO <kbd>Q</kbd>`;
  } else if (now < shield.cooldownUntil) {
    const remaining = shield.cooldownUntil - now;
    shieldState.textContent = "Escudo recargando";
    shieldTimer.textContent = `Disponible en ${Math.ceil(remaining)}s`;
    shieldMeter.style.width = `${Math.max(0, (1 - remaining / (shield.duration + shield.cooldown)) * 100)}%`;
    shieldButton.disabled = true;
    shieldButton.innerHTML = `RECARGA <kbd>Q</kbd>`;
  } else {
    shieldState.textContent = "Escudo listo";
    shieldTimer.textContent = "Protege tus pedestales de los ladrones";
    shieldMeter.style.width = "100%";
    shieldButton.disabled = false;
    shieldButton.innerHTML = `ACTIVAR <kbd>Q</kbd>`;
  }
}

function updateShieldVisual(base, active) {
  if (!base?.doorGroup) return;
  base.doorGroup.visible = true;
  base.doorGroup.children.at(-1).material.color.set(active ? "#69c8ff" : "#ff667a");
  base.doorGroup.children.at(-1).material.transparent = active;
  base.doorGroup.children.at(-1).material.opacity = active ? 0.72 : 0.32;
}

function checkRaid(now) {
  if (!worldState.startAt || now < worldState.nextRaidAt) return;
  const raider = bots.find((bot) => bot.mode === "idle");
  if (raider) {
    raider.mode = "raid";
    addFeed("¡Un rival se acerca a tu base! Pulsa F para empujarlo.", true);
  }
  worldState.nextRaidAt += 22;
  updateHud(now);
}

function updateIncome(delta, now) {
  for (const base of bases) {
    const income = base.slots.reduce((sum, slot) => sum + (slot.brainrot?.income ?? 0), 0);
    base.accrued += income * delta;
    if (base.bot) base.bot.wallet = Math.min(5000, (base.bot.wallet ?? 220) + income * delta * 0.35);
  }

  if (worldState.botPurchaseAt == null) worldState.botPurchaseAt = now + 3;
  if (now >= worldState.botPurchaseAt) {
    worldState.botPurchaseAt = now + 9;
    for (const bot of bots) {
      if (bot.mode !== "idle") continue;
      const target = lootItems.find(
        (item) => item.mode === "belt" && !item.reservedBy && item.price <= (bot.wallet ?? 220),
      );
      if (!target || !bot.base.slots.some((slot) => !slot.brainrot)) continue;
      bot.mode = "buying";
      bot.target = target;
      target.reservedBy = bot;
    }
  }

  for (const bot of bots) updateBot(bot, delta, now);
}

function updateBot(bot, delta, now) {
  const model = bot.base.botModel;
  const walkTo = (x, z) => {
    const dx = x - bot.x;
    const dz = z - bot.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 0.75) {
      bot.x += (dx / distance) * bot.speed * delta;
      bot.z += (dz / distance) * bot.speed * delta;
      model.rotation.y = Math.atan2(dx, dz);
    }
    model.position.set(bot.x - bot.base.x, 0.38 + Math.abs(Math.sin(now * 9 + bot.id)) * 0.06, bot.z - bot.base.z);
    return distance;
  };

  if (bot.mode === "buying" && bot.target) {
    if (bot.target.mode !== "belt" || bot.target.reservedBy !== bot) {
      bot.mode = "idle";
      bot.target = null;
      bot.nextAction = now + 4;
      return;
    }
    if (walkTo(0, bot.target.z) < 1.8) {
      const bought = bot.target;
      bot.target = null;
      bot.mode = "idle";
      bot.nextAction = now + 10;
      purchaseBrainrot(bought, bot.base);
    }
  } else if (bot.mode === "return") {
    if (walkTo(bot.base.x, bot.base.z) < 1) {
      bot.mode = "idle";
      bot.nextAction = now + 12;
    }
  } else if (bot.mode === "raid") {
    if (walkTo(worldState.homeBase.x, worldState.homeBase.z) < 7) {
      if (now < worldState.homeBase.shieldUntil) {
        addFeed("¡La puerta repelió al rival!", false);
        bot.mode = "escaping";
        bot.target = null;
      } else {
        const slot = worldState.homeBase.slots.find((candidate) => candidate.brainrot);
        if (slot) {
          bot.target = slot.brainrot;
          slot.brainrot.available = false;
          slot.brainrot.mode = "raided";
          slot.brainrot.group.visible = false;
          slot.brainrot = null;
          bot.mode = "escaping";
          addFeed(`¡${bot.target.name} fue robado de tu base!`, true);
        } else {
          bot.mode = "escaping";
          showToast("El rival no encontró Brainrots");
        }
      }
    }
  } else if (bot.mode === "escaping") {
    const distance = walkTo(bot.base.x, bot.base.z);
    if (distance < 1) {
      if (bot.target) {
        const slot = bot.base.slots.find((candidate) => !candidate.brainrot);
        if (slot) {
          bot.target.owner = bot.base;
          bot.target.slot = slot;
          bot.target.mode = "owned";
          bot.target.available = true;
          bot.target.x = slot.x;
          bot.target.y = slot.y;
          bot.target.z = slot.z;
          bot.target.group.position.set(slot.x, slot.y, slot.z);
          bot.target.group.visible = true;
          slot.brainrot = bot.target;
          slot.model = bot.target.group;
        }
        bot.target = null;
      }
      bot.mode = "idle";
      bot.nextAction = now + 18;
    }
  } else if (bot.mode === "idle") {
    walkTo(bot.base.x, bot.base.z);
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
      if (item.reservedBy && item.reservedBy.target !== item) continue;
      item.z += 4.2 * delta;
      if (item.z > 42) {
        item.z = -42;
        const catalog = BRAINROT_CATALOG[Math.floor(Math.random() * BRAINROT_CATALOG.length)];
        const rarity = chooseRarity();
        Object.assign(item, catalog, rarity, { value: rarity.price, rarity: rarity.name });
        if (item.sign?.userData.canvasTexture) item.sign.userData.canvasTexture.dispose();
        item.group.remove(item.sign);
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
    if (item.group.visible) {
      const scale = worldState.closestLoot === item ? 1.12 + Math.sin(now * 8) * 0.035 : 1;
      if (item.mode !== "owned") item.group.scale.setScalar(scale);
    }
  }
  for (const base of bases) {
    base.bank.material.color.set(base === worldState.homeBase && base.accrued >= 1 ? "#ffcd5e" : "#76c96f");
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
  const distance = 6.4;
  const horizontalDistance = Math.cos(cameraPitch) * distance;
  const target = new THREE.Vector3(
    player.x + Math.sin(cameraYaw) * horizontalDistance,
    player.y + 2.25 + Math.sin(cameraPitch) * distance,
    player.z + Math.cos(cameraYaw) * horizontalDistance,
  );
  const follow = 1 - Math.pow(0.0004, delta);
  camera.position.lerp(target, follow);
  const look = new THREE.Vector3(
    player.x - Math.sin(cameraYaw) * 1.4,
    player.y + 1.45,
    player.z - Math.cos(cameraYaw) * 1.4,
  );
  camera.lookAt(look);
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
  bagValue.innerHTML = `${Math.floor(homeIncome)} <small>$/s</small>`;
  bagDetail.textContent = `Banco: $${Math.floor(worldState.homeBase?.accrued ?? 0)} · ${player.carried.length} en mano`;

  const filledSlots = worldState.homeBase?.slots.filter((slot) => slot.brainrot).length ?? 0;
  missionProgress.style.width = `${(filledSlots / 4) * 100}%`;
  updateMission();

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

function updateMission() {
  if (player.carried.length > 0 && worldState.nearBase) {
    missionTitle.textContent = "Coloca tu Brainrot";
    missionDetail.textContent = "Acércate a un pedestal libre y pulsa E";
  } else if (player.carried.length > 0) {
    missionTitle.textContent = "¡Vuelve a tu base!";
    missionDetail.textContent = `${player.carried[0].name} te sigue · pulsa E en un pedestal`;
  } else if (worldState.homeBase?.slots.every((slot) => slot.brainrot)) {
    missionTitle.textContent = "¡Base completa!";
    missionDetail.textContent = `Recoge $${Math.floor(worldState.homeBase.accrued)} del botón verde`;
  } else {
    missionTitle.textContent = "¡Compra en la pasarela!";
    missionDetail.textContent = "Acércate a un Brainrot y pulsa E · roba en bases rivales";
  }
}

function addFeed(message, warning) {
  const line = document.createElement("div");
  line.className = `feed-message${warning ? " is-warning" : ""}`;
  const marker = document.createElement("i");
  marker.setAttribute("aria-hidden", "true");
  const text = document.createElement("span");
  text.textContent = message;
  line.append(marker, text);
  feedMessages.prepend(line);
  while (feedMessages.children.length > 3) feedMessages.lastElementChild.remove();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  worldState.toastUntil = performance.now() / 1000 + 1.8;
}
