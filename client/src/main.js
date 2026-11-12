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
scene.background = new THREE.Color("#10172a");
scene.fog = new THREE.FogExp2("#10172a", 0.012);

const camera = new THREE.PerspectiveCamera(47, 1, 0.1, 180);
camera.position.set(-11, 12, 18);
let cameraSensitivity = 1;
let cameraYaw = 0;
let cameraPitch = 0;
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

const hemiLight = new THREE.HemisphereLight("#b5d8ff", "#111324", 2.2);
scene.add(hemiLight);

const moonLight = new THREE.DirectionalLight("#f4f3ff", 3);
moonLight.position.set(-12, 23, 12);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(2048, 2048);
moonLight.shadow.camera.left = -35;
moonLight.shadow.camera.right = 35;
moonLight.shadow.camera.top = 35;
moonLight.shadow.camera.bottom = -35;
scene.add(moonLight);

const cyanLight = new THREE.PointLight("#3df3d2", 36, 22, 2);
cyanLight.position.set(0, 4, 0);
scene.add(cyanLight);

const platforms = [];
const lootItems = [];
const keys = new Set();
const clock = new THREE.Clock();

const player = {
  x: 0,
  y: 0,
  z: 0,
  vy: 0,
  grounded: true,
  facing: 0,
  speed: 7.2,
  jump: 9.5,
  upgradeJump: 0,
  capacity: 3,
  carried: [],
  cash: 0,
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
  nextRaidAt: 35,
  lastInteraction: 0,
  toastUntil: 0,
  paused: false,
  closestLoot: null,
  nearBase: false,
};

const platformSpecs = [
  { x: 0, z: 0, y: 0, width: 11, depth: 11, kind: "base" },
  { x: 8, z: 0, y: 0.6, width: 4.4, depth: 4.4, kind: "path" },
  { x: 13, z: -2.4, y: 1.2, width: 4.6, depth: 4.6, kind: "path" },
  { x: 18, z: 1.2, y: 1.8, width: 4.8, depth: 4.8, kind: "path" },
  { x: 25, z: 0, y: 1, width: 9, depth: 9, kind: "vault" },
];

const lootSpecs = [
  { x: 8, z: 0, y: 0.6, name: "Pompón Cósmico", value: 15, color: "#51ead2", shape: "sphere" },
  { x: 13, z: -2.4, y: 1.2, name: "Sapo Nebular", value: 25, color: "#b28aff", shape: "frog" },
  { x: 18, z: 1.2, y: 1.8, name: "Tostada Astral", value: 35, color: "#ffcb68", shape: "toast" },
  { x: 25, z: 0, y: 1, name: "Píxel Gelatinoso", value: 55, color: "#ff759d", shape: "pixel" },
];

const avatar = new THREE.Group();
const fallbackAvatar = createAvatar();
avatar.add(fallbackAvatar);
scene.add(avatar);
const followAccessories = [];
const carriedModels = [];
const laserShield = createLaserShield();
scene.add(laserShield);
laserShield.visible = false;

createWorld();
createLoot();
createStars();
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
  worldState.nextRaidAt = 35;
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
  player.x = 0;
  player.y = 0;
  player.z = 0;
  player.vy = 0;
  player.grounded = true;
  avatar.position.set(0, 0, 0);
  syncCarriedModels();
  showToast("Volviste a tu base");
}

function createWorld() {
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

function bindControls() {
  const keyMap = new Map([
    ["KeyW", "forward"],
    ["ArrowUp", "forward"],
    ["KeyS", "back"],
    ["ArrowDown", "back"],
    ["KeyA", "left"],
    ["ArrowLeft", "left"],
    ["KeyD", "right"],
    ["ArrowRight", "right"],
  ]);

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
  animateLoot(now);
  animateAvatar(now);
  updateEmote(now);
  avatar.updateMatrixWorld(true);
  updateFollowAccessories();
  updateShield(now);
  checkLootProximity(now);
  checkRaid(now);
  updateCamera(delta);
  updateLabels();
  updateHud(now);
  renderer.render(scene, camera);
}

function movePlayer(delta) {
  let moveX = 0;
  let moveZ = 0;
  if (keys.has("KeyW") || keys.has("ArrowUp")) moveX += 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) moveX -= 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) moveZ += 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) moveZ -= 1;

  const moving = moveX !== 0 || moveZ !== 0;
  if (moving) {
    stopEmote();
    const length = Math.hypot(moveX, moveZ);
    moveX /= length;
    moveZ /= length;
    player.x += moveX * player.speed * delta;
    player.z += moveZ * player.speed * delta;
    player.facing = Math.atan2(moveZ, moveX);
  }

  const previouslyGrounded = player.grounded;
  const previousY = player.y;
  if (previouslyGrounded && !findPlatform(player.x, player.z, player.y)) {
    player.grounded = false;
  }
  player.vy -= 23 * delta;
  player.y += player.vy * delta;

  if (player.vy <= 0) {
    const landing = platforms
      .filter((platform) => previousY >= platform.y - 0.05 && player.y <= platform.y && isWithinPlatform(platform, player.x, player.z))
      .sort((a, b) => b.y - a.y)[0];
    if (landing) {
      player.y = landing.y;
      player.vy = 0;
      player.grounded = true;
    }
  }

  if (player.y < -8) {
    if (player.carried.length > 0) {
      const lost = player.carried.pop();
      addFeed(`Perdiste ${lost.name} al caer.`, true);
    }
    resetPlayerToSpawn();
    showToast("Regresaste a tu base");
    audio.playTone(180, 0.2, "triangle");
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

  if (worldState.closestLoot && player.carried.length < player.capacity) {
    collectLoot(worldState.closestLoot);
    return;
  }

  if (worldState.nearBase && player.carried.length > 0) {
    depositLoot();
    return;
  }

  if (player.carried.length >= player.capacity) {
    showToast("Mochila llena: vuelve a tu base");
  } else {
    showToast("Acércate a un hallazgo luminoso");
  }
}

function checkLootProximity(now) {
  worldState.closestLoot = null;
  let closestDistance = 1.65;

  for (const item of lootItems) {
    if (!item.available) {
      if (now >= item.respawnAt) respawnLoot(item);
      continue;
    }
    item.group.visible = true;
    const distance = Math.hypot(player.x - item.x, player.z - item.z);
    if (distance < closestDistance && Math.abs(player.y - item.y) < 2.2) {
      closestDistance = distance;
      worldState.closestLoot = item;
    }
  }

  worldState.nearBase = Math.hypot(player.x, player.z) < 3.7 && Math.abs(player.y) < 1;
  const canInteract = Boolean(worldState.closestLoot && player.carried.length < player.capacity) || (worldState.nearBase && player.carried.length > 0);
  prompt.classList.toggle("is-visible", canInteract);
  prompt.querySelector("span").textContent = worldState.nearBase && player.carried.length > 0 ? "Depositar en la base" : "Recoger hallazgo";
}

function collectLoot(item) {
  item.available = false;
  item.respawnAt = performance.now() / 1000 + 24;
  item.group.visible = false;
  player.carried.push({ name: item.name, value: item.value, color: item.color, shape: item.shape });
  syncCarriedModels();
  updateMission();
  addFeed(`Recogiste ${item.name} · valor ${item.value} créditos.`, false);
  showToast(`${item.name} guardado`);
  audio.playTone(660, 0.12);
}

function respawnLoot(item) {
  item.available = true;
  item.group.visible = true;
  item.respawnAt = 0;
  addFeed(`Un hallazgo reapareció: ${item.name}.`, false);
}

function depositLoot() {
  const amount = player.carried.reduce((sum, item) => sum + item.value, 0);
  if (amount <= 0) return;
  player.cash += amount;
  const count = player.carried.length;
  void submitLeaderboardScore(count);
  player.carried = [];
  syncCarriedModels();
  updateHud();
  updateMission();
  addFeed(`Vendiste ${count} hallazgo${count === 1 ? "" : "s"} por ${amount} créditos.`, false);
  showToast(`+${amount} créditos`);
  audio.playTone(523.25, 0.18);
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
    const model = createCollectible(item);
    model.scale.setScalar(0.28);
    model.position.set((index - 1) * 0.35, 1.9 + index * 0.06, -0.25);
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
  laserShield.visible = true;
  addFeed("Escudo láser activo: tu base está protegida.", false);
  showToast("Escudo láser activado");
}

function updateShield(now) {
  const active = now < shield.activeUntil;
  laserShield.visible = active;
  laserShield.children.forEach((beam, index) => {
    if (beam.material) beam.material.opacity = 0.35 + Math.sin(now * 8 + index) * 0.16;
  });

  if (active) {
    shieldState.textContent = "Base protegida";
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
    shieldTimer.textContent = "Protege tus créditos de los saqueadores";
    shieldMeter.style.width = "100%";
    shieldButton.disabled = false;
    shieldButton.innerHTML = `ACTIVAR <kbd>Q</kbd>`;
  }
}

function checkRaid(now) {
  if (!worldState.startAt || now < worldState.nextRaidAt) return;
  const hasShield = now < shield.activeUntil;
  if (hasShield) {
    addFeed("¡El escudo repelió a un saqueador! Tu saldo está a salvo.", false);
    showToast("Saqueador repelido");
  } else if (player.cash > 0) {
    const lost = Math.min(20, player.cash);
    player.cash -= lost;
    addFeed(`Un saqueador escapó con ${lost} créditos. Activa el escudo con Q.`, true);
    showToast(`Perdiste ${lost} créditos`);
  } else {
    addFeed("Un saqueador rondó tu base vacía. ¡Activa el escudo con Q!", true);
  }
  worldState.nextRaidAt += 35;
  updateHud(now);
}

function animateLoot(now) {
  for (const item of lootItems) {
    if (!item.available) continue;
    item.group.position.y = item.baseY + Math.sin(now * 2.3 + item.index * 1.7) * 0.16;
    item.group.rotation.y = now * 0.7 + item.index;
    item.group.rotation.z = Math.sin(now * 1.3 + item.index) * 0.06;
    const scale = worldState.closestLoot === item ? 1.12 + Math.sin(now * 8) * 0.04 : 1;
    item.group.scale.setScalar(scale);
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
  const offset = new THREE.Vector3(-10.5, 9.5, 15);
  offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraYaw);
  offset.y = Math.max(5, offset.y - cameraPitch * 10);
  const target = new THREE.Vector3(player.x, player.y, player.z).add(offset);
  camera.position.lerp(target, 1 - Math.pow(0.001, delta));
  camera.lookAt(player.x + 3.5, player.y + 0.5, player.z);
}

function updateLabels() {
  placeLabel(document.querySelector(".label-base"), new THREE.Vector3(0, 2.8, 0));
  placeLabel(document.querySelector(".label-vault"), new THREE.Vector3(25, 3.4, 0));
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
  bagValue.innerHTML = `${player.carried.length} <small>/ ${player.capacity}</small>`;
  bagDetail.textContent = player.carried.length
    ? `Valor: ${player.carried.reduce((sum, item) => sum + item.value, 0)} créditos`
    : "Vacía · vuelve a tu base";

  const totalLoot = lootSpecs.length;
  const collected = lootItems.filter((item) => !item.available).length;
  missionProgress.style.width = `${Math.min(100, (collected / totalLoot) * 100)}%`;
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
  if (player.carried.length > 0) {
    missionTitle.textContent = "Vuelve a tu base";
    missionDetail.textContent = `${player.carried.length} hallazgo${player.carried.length === 1 ? "" : "s"} en la mochila · pulsa E`;
  } else if (lootItems.some((item) => item.available)) {
    missionTitle.textContent = "Encuentra una criatura";
    missionDetail.textContent = "Sigue las plataformas luminosas";
  } else {
    missionTitle.textContent = "Ruta despejada";
    missionDetail.textContent = "Los hallazgos vuelven pronto";
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
