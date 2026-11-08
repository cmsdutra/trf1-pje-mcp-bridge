/**
 * Aplica `fn` a cada item com no máximo `concorrencia` execuções simultâneas. O resultado de cada item
 * fica na posição do item, independentemente da ordem em que as execuções terminam. `fn` não deve lançar:
 * quem precisa registrar falhas as captura dentro dela.
 */
export async function executarEmPool<T, R>(itens: readonly T[], concorrencia: number, fn: (item: T, indice: number) => Promise<R>): Promise<R[]> {
  const resultados = new Array<R>(itens.length);
  let proximo = 0;
  const trabalhador = async (): Promise<void> => {
    while (proximo < itens.length) {
      const i = proximo++;
      resultados[i] = await fn(itens[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concorrencia, itens.length)) }, trabalhador));
  return resultados;
}
