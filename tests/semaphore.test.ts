import { describe, expect, it } from "vitest";
import { Semaphore } from "../src/utils/semaphore.js";

describe("Semaphore", () => {
  it("limita a concorrência e libera em FIFO", async () => {
    const sem = new Semaphore(2);
    let ativos = 0;
    let pico = 0;
    const ordem: number[] = [];
    const tarefa = async (n: number) => {
      await sem.acquire();
      ativos++;
      pico = Math.max(pico, ativos);
      ordem.push(n);
      await new Promise((r) => setTimeout(r, 5));
      ativos--;
      sem.release();
    };
    await Promise.all([1, 2, 3, 4, 5].map(tarefa));
    expect(pico).toBe(2);
    expect(ordem).toEqual([1, 2, 3, 4, 5]);
  });
});
