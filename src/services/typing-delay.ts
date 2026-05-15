const RESPUESTAS_RAPIDAS = [
  /^(sí|si|no|ok|dale|listo|perfecto|genial|gracias|muchas gracias|claro|exacto|buenísimo|hecho)[\s!.]*$/i,
  /^(כן|לא|אוקי|תודה|תודה רבה|מעולה|סבבה|יופי|בסדר|אחלה|סבבה גמור|נהדר|מושלם|בדיוק)[\s!.]*$/i,
  /^(yes|no|ok|okay|thanks|thank you|great|perfect|sure|exactly|got it|nice|cool|done|awesome)[\s!.]*$/i,
  /^(да|нет|ок|окей|спасибо|большое спасибо|отлично|хорошо|понял|супер|класс|круто|идеально|конечно)[\s!.]*$/i,
];

const INDICADORES_COMPLEJIDAD = [
  "precio", "costo", "incluye", "servicio", "diferencia", "explicar",
  "cómo funciona", "como funciona", "proceso", "contrato", "cancelar",
  "soporte", "problema", "error", "ayuda", "técnico", "comparar",
];

const state: { messageCount: number; nextLongPause: number } = {
  messageCount: 0,
  nextLongPause: randomInt(6, 15),
};

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function isQuickResponse(text: string): boolean {
  const clean = text.trim().toLowerCase();
  return RESPUESTAS_RAPIDAS.some((pattern) => pattern.test(clean));
}

function calculateComplexity(text: string): number {
  const lower = text.toLowerCase();
  const hits = INDICADORES_COMPLEJIDAD.filter((w) => lower.includes(w)).length;

  const hasList = (text.match(/\n/g) || []).length >= 3 || text.includes("•") || (text.match(/-/g) || []).length >= 3;
  const hasNumbers = /\d+\s*₪|\d+%|\d{3,}/.test(text);
  const hasLongAnswer = !text.includes("?") && text.length > 200;

  let complexity = 1.0;
  complexity += Math.min(hits * 0.15, 0.5);
  if (hasList) complexity += 0.2;
  if (hasNumbers) complexity += 0.15;
  if (hasLongAnswer) complexity += 0.15;

  return Math.min(complexity, 2.0);
}

export function calculateDelay(text: string): number {
  state.messageCount++;

  if (state.messageCount >= state.nextLongPause) {
    state.messageCount = 0;
    state.nextLongPause = randomInt(6, 15);
    const pause = randomFloat(90.0, 140.0);
    console.log(`[delay] Pausa larga simulada: ${pause.toFixed(0)}s`);
    return pause;
  }

  if (isQuickResponse(text)) {
    return randomFloat(2.0, 4.0);
  }

  const chars = text.length;
  const complexity = calculateComplexity(text);
  const thinkTime = randomFloat(3.0, 6.0) * complexity;
  const writeTime = chars / 12.0;
  const variation = randomFloat(-1.5, 2.5);

  const total = thinkTime + writeTime + variation;
  return Math.max(5.0, Math.min(total, 25.0));
}

export function interFragmentDelay(): number {
  return randomFloat(1.5, 5.0);
}

export function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}
