export function getMethods<T>(cls: new (...args: any[]) => T): Array<keyof T> {
  return Object.getOwnPropertyNames(cls.prototype).filter(
    (protoProp) =>
      typeof cls.prototype[protoProp as keyof T] === 'function' && protoProp !== 'constructor'
  ) as Array<keyof T>
}
