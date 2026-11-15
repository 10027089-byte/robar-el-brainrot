export const RARITIES = [
  { name: "Común", color: "#e2e8f0", chance: 0.38 },
  { name: "No Común", color: "#22c55e", chance: 0.25 },
  { name: "Raro", color: "#3b82f6", chance: 0.16 },
  { name: "Épico", color: "#a855f7", chance: 0.10 },
  { name: "Legendario", color: "#eab308", chance: 0.06 },
  { name: "Mítico", color: "#ef4444", chance: 0.035 },
  { name: "Brainrot God", color: "#06b6d4", chance: 0.015 },
];

const entries = [
  ["Noobini Pizzanini", "Común", 25, 2, "#f4bf3b", "Avatar noob amarillo y azul con pizza en la cabeza"],
  ["Lirilì Larilà", "Común", 50, 4, "#4dba62", "Cactus verde con orejas grises y sandalias"],
  ["Tim Cheese", "Común", 85, 7, "#9da6ae", "Ratón gris con sombrero de queso"],
  ["Fluriflura", "Común", 120, 10, "#65b95c", "Criatura verde con corona de flores"],
  ["Talpa Di Fero", "No Común", 220, 18, "#936545", "Topo marrón con casco de minero"],
  ["Svinina Bombardino", "No Común", 350, 28, "#ed9da8", "Cerdito rosado con alas y gafas"],
  ["Pipi Kiwi", "No Común", 500, 40, "#9a623d", "Pájaro kiwi marrón con pico amarillo"],
  ["Trippi Troppi", "Raro", 950, 75, "#f07836", "Camarón naranja con cabeza de gato"],
  ["Tung Tung Tung Sahur", "Raro", 1500, 115, "#93603f", "Tronco de madera con brazos y bate"],
  ["Boneca Ambalabu", "Raro", 2400, 180, "#67ba56", "Rana verde sobre una llanta negra"],
  ["Cappuccino Assassino", "Épico", 4500, 320, "#efe5d4", "Café con banda ninja y katanas"],
  ["Brr Brr Patapim", "Épico", 7000, 480, "#895c3e", "Criatura del bosque con hojas y pies grandes"],
  ["Trulimero Trulicina", "Épico", 10500, 700, "#55b8d1", "Pez azul plateado con patas largas"],
  ["Chimpanzini Bananini", "Legendario", 18000, 1200, "#d69443", "Mono saliendo de una cáscara de plátano"],
  ["Ballerina Cappuccina", "Legendario", 28000, 1850, "#f4afcf", "Bailarina con tutú rosa y cabeza de cappuccino"],
  ["Glorbo Fruttodrillo", "Legendario", 42000, 2700, "#4b9d45", "Cocodrilo verde con cuerpo de sandía"],
  ["Frigo Camelo", "Mítico", 65000, 4200, "#e9e7df", "Refrigerador con cabeza y cuello de camello"],
  ["Orangutini Ananassini", "Mítico", 95000, 6000, "#e58c38", "Orangután naranja con cuerpo de piña"],
  ["Bombardiro Crocodilo", "Mítico", 140000, 8800, "#75824a", "Avión bombardero con hocico de cocodrilo"],
  ["Tralalero Tralala", "Brainrot God", 250000, 15000, "#338aca", "Tiburón azul con aleta y zapatillas"],
  ["Odin Din Din Dun", "Brainrot God", 400000, 24000, "#f18a22", "Figura naranja musculosa con gafas y tenis"],
  ["Matteo", "Brainrot God", 650000, 38000, "#e0b63e", "Personaje con sombrero negro, corbata y aura dorada"],
];

export const BRAINROT_CATALOG = entries.map(([name, rarity, price, income, color, style], index) => ({
  name,
  rarity,
  price,
  income,
  color,
  style,
  shape: ["noob", "cactus", "mouse", "flower", "mole", "pig", "kiwi", "shrimp", "wood", "frog", "coffee", "forest", "fish", "monkey", "dancer", "crocodile", "fridge", "pineapple", "plane", "shark", "orange", "matteo"][index],
}));
