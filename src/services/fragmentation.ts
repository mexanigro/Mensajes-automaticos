function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function fragmentMessage(text: string): string[] {
  const chars = text.length;

  if (chars < 150) return [text];

  if (chars < 400 && Math.random() < 0.5) return [text];

  let maxChars = randomInt(180, 350);
  const fragments: string[] = [];
  const paragraphs = text.split("\n\n");

  let current = "";
  for (const paragraph of paragraphs) {
    if (current.length + paragraph.length + 2 > maxChars && current) {
      fragments.push(current.trim());
      current = paragraph;
      maxChars = randomInt(180, 350);
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  if (current.trim()) {
    fragments.push(current.trim());
  }

  if (fragments.length <= 1 && chars > 400) {
    fragments.length = 0;
    const sentences = text.split(/(?<=[.!?])\s+/);
    current = "";
    maxChars = randomInt(150, 300);
    for (const sentence of sentences) {
      if (current.length + sentence.length + 1 > maxChars && current) {
        fragments.push(current.trim());
        current = sentence;
        maxChars = randomInt(150, 300);
      } else {
        current = current ? `${current} ${sentence}` : sentence;
      }
    }
    if (current.trim()) {
      fragments.push(current.trim());
    }
  }

  return fragments.length > 0 ? fragments : [text];
}
