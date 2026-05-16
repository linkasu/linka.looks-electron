const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const INVALID_NAME_CHARS = /[§/\\:*?"<>|]/;

export function validateStorageName (input: string): true | string {
  const name = input.trim();

  if (!name) return "Введите название";
  if (INVALID_NAME_CHARS.test(name) || hasControlChars(name)) return "Название содержит спецсимволы";
  if (RESERVED_WINDOWS_NAMES.test(name)) return "Недопустимое системное имя";
  if (/[. ]$/.test(name)) return "Название не должно заканчиваться точкой или пробелом";

  return true;
}

function hasControlChars (name: string): boolean {
  return [...name].some((char) => char.charCodeAt(0) < 32);
}

export function assertValidStorageName (input: string): void {
  const result = validateStorageName(input);
  if (result !== true) {
    throw new Error(result);
  }
}
