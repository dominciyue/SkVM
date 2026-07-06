import { buildDefaultMatrixInput, buildExperimentMatrix } from "./matrix";

const input = buildDefaultMatrixInput();
const matrix = buildExperimentMatrix(input);

console.log(
  JSON.stringify(
    {
      count: matrix.length,
      input,
      matrix,
    },
    null,
    2,
  ),
);
