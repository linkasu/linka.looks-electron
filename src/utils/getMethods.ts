
export function getMethods<T> (cls: new (...args: any[]) => T): string[] {
  return Object.getOwnPropertyNames(cls.prototype).filter(c => c !== "constructor");
}
