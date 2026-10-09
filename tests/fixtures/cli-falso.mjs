// Faz o papel do CLI nos testes do disparo por HTTP: imprime o argv e N linhas, uma no stderr, e sai com o código
// pedido depois de `--espera` ms. Usa `process.exitCode` para não cortar a saída que ainda está no pipe.
const args = process.argv.slice(2);
const valor = (f) => {
  const i = args.indexOf(f);
  return i === -1 ? undefined : args[i + 1];
};

console.log(`argv: ${JSON.stringify(args)}`);
for (let i = 1; i <= Number(valor("--linhas") ?? 0); i++) console.log(`linha ${i}`);
process.stdout.write("sem quebra no fim");
console.error("aviso no stderr");
setTimeout(() => {
  process.exitCode = Number(valor("--codigo") ?? 0);
}, Number(valor("--espera") ?? 0));
