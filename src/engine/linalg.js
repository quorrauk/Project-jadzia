// Dense linear solver: Gaussian elimination with partial pivoting.
// Circuits here are tiny (tens of unknowns), so dense is fine and easy to read.

const PIVOT_EPSILON = 1e-13;

/**
 * Solve A x = b. A is an n x n array of arrays, b an array of n numbers.
 * Inputs are not modified.
 * @returns {{ singular: boolean, x: number[] }}  x is all zeros when singular.
 */
export function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivotRow][col])) pivotRow = r;
    }
    if (Math.abs(M[pivotRow][col]) < PIVOT_EPSILON) {
      return { singular: true, x: new Array(n).fill(0) };
    }
    if (pivotRow !== col) [M[pivotRow], M[col]] = [M[col], M[pivotRow]];

    for (let r = col + 1; r < n; r++) {
      const factor = M[r][col] / M[col][col];
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }

  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = M[r][n];
    for (let c = r + 1; c < n; c++) sum -= M[r][c] * x[c];
    x[r] = sum / M[r][r];
  }
  return { singular: x.some((v) => !Number.isFinite(v)), x };
}
