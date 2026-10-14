export const rand = (i: number, salt = 0) => {
  const n = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453
  return n - Math.floor(n)
}
