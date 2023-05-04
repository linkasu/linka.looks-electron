
interface Vector {
    x: number;
    y: number
}

export function getDistance(a: Vector, b: Vector) {
    return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2))
}