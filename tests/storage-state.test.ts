import path from "node:path";
import { describe, expect, it } from "vitest";
import { config, storageStatePathFor } from "../src/config.js";

describe("storageStatePathFor", () => {
  it("usa o caminho configurado no 1º grau", () => {
    expect(storageStatePathFor("1")).toBe(config.storageStatePath);
  });

  it("separa o arquivo do 2º grau, na mesma pasta e com a mesma extensão", () => {
    const base = path.parse(config.storageStatePath);
    const segundo = path.parse(storageStatePathFor("2"));
    expect(segundo.dir).toBe(base.dir);
    expect(segundo.ext).toBe(base.ext);
    expect(segundo.name).toBe(`${base.name}-2g`);
    expect(storageStatePathFor("2")).not.toBe(storageStatePathFor("1"));
  });
});
