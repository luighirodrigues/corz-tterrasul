/**
 * `fetch` para as rotas do próprio painel. Se a sessão acabou (401: vencida, usuário desativado ou senha
 * trocada em outro lugar), leva para o login e depois volta para esta mesma tela.
 */
export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const resposta = await fetch(url, init);
  if (resposta.status === 401 && typeof window !== "undefined") {
    window.location.assign(`/login?volta=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }
  return resposta;
}
