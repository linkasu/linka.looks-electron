
export function getMethods<T> (cls: new (...args: any[]) => T): Array<keyof T> {
  return Object.getOwnPropertyNames(cls.prototype)
    .filter(proto_prop => typeof cls.prototype[proto_prop as keyof T] === "function"
      && proto_prop !== "constructor") as Array<keyof T>;
}
