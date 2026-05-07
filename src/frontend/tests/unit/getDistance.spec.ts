import chai from "chai";
import { getDistance } from "@/frontend/utils/getDistance";

const expect = chai.expect;

describe("getDistance", () => {
  it("calculates Euclidean distance", () => {
    expect(getDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).to.equal(5);
  });

  it("returns zero for identical points", () => {
    expect(getDistance({ x: -2, y: 10 }, { x: -2, y: 10 })).to.equal(0);
  });
});
