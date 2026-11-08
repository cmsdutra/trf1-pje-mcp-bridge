import { describe, expect, it } from "vitest";
import { executarEmPool } from "../src/utils/pool.js";

const dormir = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("executarEmPool", () => {
  it("devolve os resultados na ordem dos itens, mesmo terminando fora de ordem", async () => {
    const atrasos = [40, 5, 20, 1];
    const r = await executarEmPool(atrasos, 4, async (ms, i) => {
      await dormir(ms);
      return i;
    });
    expect(r).toEqual([0, 1, 2, 3]);
  });

  it("nunca excede a concorrência pedida", async () => {
    let emAndamento = 0;
    let pico = 0;
    await executarEmPool(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
      pico = Math.max(pico, ++emAndamento);
      await dormir(5);
      emAndamento--;
    });
    expect(pico).toBe(3);
  });

  it("concorrência 1 é sequencial", async () => {
    const ordem: number[] = [];
    await executarEmPool([1, 2, 3], 1, async (n) => {
      ordem.push(n);
      await dormir(n === 1 ? 10 : 1);
      ordem.push(-n);
    });
    expect(ordem).toEqual([1, -1, 2, -2, 3, -3]);
  });

  it("lista vazia e concorrência maior que os itens funcionam", async () => {
    expect(await executarEmPool([], 3, async () => 1)).toEqual([]);
    expect(await executarEmPool(["a"], 8, async (s) => s.toUpperCase())).toEqual(["A"]);
  });
});
