import type { Muscle } from "../../../shared/enums";

/**
 * Hand-drawn muscle-map artwork (original to Forge, no third-party assets).
 *
 * Each figure lives in a 200×440 box with the spine on x = 100. Only the
 * figure's right-hand side (x ≤ 100) is listed; the renderer mirrors it.
 * A shape with `muscle: null` is body structure (head, hands, knees, feet)
 * and is never highlighted.
 */
export type BodyShape = { muscle: Muscle | null; points: string };

export const BODY_VIEWBOX = { width: 200, height: 440 } as const;
export const BODY_HEAD = { cx: 100, cy: 28, rx: 17, ry: 23 } as const;

export const FRONT_SHAPES: BodyShape[] = [
  // Neck and the upper trapezius visible over the collarbone
  { muscle: null, points: "90,48 100,52 100,70 88,66" },
  { muscle: "back", points: "88,60 89,70 74,76 70,74 80,66" },
  // Front delt
  { muscle: "shoulders", points: "70,77 82,79 79,94 70,110 58,118 54,104 58,88" },
  // Pec: clavicular and sternal heads
  { muscle: "chest", points: "84,78 99,82 99,96 76,99 81,88" },
  { muscle: "chest", points: "76,101 99,98 99,124 90,129 76,125 68,115" },
  // Serratus + obliques
  { muscle: "core", points: "70,119 76,128 75,142 70,138 68,128" },
  { muscle: "core", points: "77,130 85,131 84,192 80,202 72,192 70,170 74,148" },
  // Rectus abdominis, three rows plus the lower section
  { muscle: "core", points: "88,131 99,130 99,148 87,148" },
  { muscle: "core", points: "87,151 99,151 99,168 86,168" },
  { muscle: "core", points: "86,171 99,171 99,188 86,188" },
  { muscle: "core", points: "86,191 99,191 99,216 93,212 87,202" },
  // Biceps
  { muscle: "biceps", points: "56,120 68,116 70,132 66,154 58,160 52,150 52,132" },
  // Forearm: brachioradialis and flexors
  { muscle: "forearms", points: "50,163 60,159 64,164 58,180 50,200 44,200 45,180" },
  { muscle: "forearms", points: "62,168 67,166 64,186 56,212 48,214 46,206 52,198 58,182" },
  // Hand
  { muscle: null, points: "45,217 56,216 58,232 53,245 45,245 41,231" },
  // Quads: vastus lateralis, rectus femoris, vastus medialis
  { muscle: "quadriceps", points: "68,208 78,216 80,262 77,296 71,302 64,280 62,246" },
  { muscle: "quadriceps", points: "81,218 92,228 92,268 86,298 81,300 81,262" },
  { muscle: "quadriceps", points: "93,272 96,264 97,300 91,309 85,304 88,292" },
  // Adductors (no dedicated enum value)
  { muscle: null, points: "93,230 99,234 99,262 96,262 93,268" },
  // Knee
  { muscle: null, points: "73,305 89,311 91,322 80,326 72,318" },
  // Lower leg: tibialis (structure) and the visible inner calf
  { muscle: null, points: "72,328 83,330 83,372 80,400 74,397 70,360" },
  { muscle: "calves", points: "86,328 94,334 94,368 88,392 85,372" },
  // Ankle and foot
  { muscle: null, points: "76,402 87,396 87,410 76,410" },
  { muscle: null, points: "74,412 89,412 93,428 70,430" },
];

export const BACK_SHAPES: BodyShape[] = [
  // Neck
  { muscle: null, points: "90,48 100,50 100,58 89,60" },
  // Trapezius kite
  { muscle: "back", points: "100,52 100,142 91,120 85,100 68,81 82,73 90,62" },
  // Rear delt
  { muscle: "shoulders", points: "66,83 80,93 72,110 58,118 55,100 59,88" },
  // Infraspinatus / teres
  { muscle: "back", points: "72,96 84,102 89,122 77,127 67,114" },
  // Lats
  { muscle: "back", points: "67,118 78,129 90,125 99,146 99,170 90,192 80,196 74,176 70,150" },
  // Spinal erectors
  { muscle: "back", points: "91,195 99,173 99,214 88,214" },
  // Triceps: lateral and long heads
  { muscle: "triceps", points: "56,120 63,117 65,134 61,156 54,160 50,146 50,132" },
  { muscle: "triceps", points: "65,117 71,115 71,140 67,158 63,156 67,134" },
  // Forearm extensors
  { muscle: "forearms", points: "50,163 60,159 64,164 58,180 50,200 44,200 45,180" },
  { muscle: "forearms", points: "62,168 67,166 64,186 56,212 48,214 46,206 52,198 58,182" },
  // Hand
  { muscle: null, points: "45,217 56,216 58,232 53,245 45,245 41,231" },
  // Glute medius and maximus
  { muscle: "glutes", points: "74,196 88,198 84,212 71,212" },
  { muscle: "glutes", points: "70,215 99,217 99,257 83,263 70,251 67,231" },
  // Hamstrings: biceps femoris and semitendinosus
  { muscle: "hamstrings", points: "66,262 80,267 80,308 74,318 66,300 62,276" },
  { muscle: "hamstrings", points: "82,266 98,262 96,298 88,318 82,312" },
  // Back of the knee
  { muscle: null, points: "74,320 88,320 90,326 72,326" },
  // Calves: both gastrocnemius heads and the soleus
  { muscle: "calves", points: "69,328 82,330 82,362 76,375 70,362 66,342" },
  { muscle: "calves", points: "84,330 95,326 97,346 92,372 84,366" },
  { muscle: "calves", points: "73,378 91,376 88,396 77,398" },
  // Achilles and foot
  { muscle: null, points: "78,400 88,400 86,410 80,410" },
  { muscle: null, points: "74,412 89,412 92,428 71,430" },
];
