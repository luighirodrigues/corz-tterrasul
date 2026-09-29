# Listagem de Agentes e UUIDs - TTerraSul Santana

Documento de mapeamento de identificadores de agentes do tenant **TTerraSul - Santana** (`tenant_id: 0288268d-895b-48b8-b4d4-1b90c4ea8901`).

Na arquitetura da **FLW Chat**, existem dois identificadores principais:
1. **UUID de Cadastro do Agente (`GET /v1/agent`):** Identificador da entidade de agente na API da FLW.
2. **UUID de Sessão (`userId`):** Identificador de usuário associado aos atendimentos e mensagens sincronizadas.

---

## 1. Agentes Cadastrados na FLW Chat (`GET /v1/agent`)

| Nome | E-mail | UUID na FLW Chat (`external_id`) | UUID Interno (Postgres) | Status |
| :--- | :--- | :--- | :--- | :---: |
| **Agendamento** | `agendamentosl@tterrasul.com.br` | `e3feafef-540c-42b9-be63-1a544f8607a1` | `3b45cc6d-70d5-4674-958a-6453fbe0f15f` | Ativo |
| **Amanda** | `amanda@tterrasul.com.br` | `ef913b41-c34c-49d4-954c-8c5275312993` | `a5b3173b-d6a9-4826-a123-5c2f73c9be50` | Ativo |
| **Ana** | `anapaulasl@tterrasul.com.br` | `07b58c5a-dbf2-42d7-a11c-4d727058b248` | `21efeac1-89f8-4a68-bb25-01a28d94f64c` | Ativo |
| **Cristiano** | `corz@tterrasul.com.br` | `eb584515-fd5e-4211-8f64-ae1d3989d155` | `5851810d-5b87-4232-b287-a7c5dda0c154` | Ativo |
| **Diego** | `diegosl@tterrasul.com.br` | `5cb85f53-0c15-422d-82e7-4ce5f7a769f7` | `6310c9f6-4205-45de-8b40-451c404d669d` | Ativo |
| **Dione** | `dionesl@tterrasul.com.br` | `64e868e2-b9bb-40b0-a25f-a2ddf598f033` | `0f8a17fa-9323-4d40-b3ad-22df8a344401` | Ativo |
| **Fabiano (Gmail)** | `fabiano.tterrasulsantana@gmail.com` | `b3ed31e7-050b-48fe-b89b-3edb63cd7e09` | `c6397143-7d86-491f-b4db-d251d779692a` | Ativo |
| **Fabiano** | `fabiano@tterrasul.com.br` | `787c8a4d-c869-41ef-aee2-79e5c8d91c11` | `b9e75873-1a9d-41d2-8b6a-ae9675297d53` | Ativo |
| **Fernando** | `fernando@tterrasul.com.br` | `85fb93e7-c8b8-4a9e-a941-a92a336efbb9` | `55d3651c-bef9-4348-8edf-ec6c7c6e8cb1` | Ativo |
| **Henrique** | `luishenriquesl@tterrasul.com.br` | `110f26ba-7319-4e89-930e-088dd6033303` | `43704b2e-7c92-47c7-b362-1de39e53ab23` | Ativo |
| **Jorge** | `jorgesl@tterrasul.com.br` | `24f93f2b-aa49-42b1-8646-9e864167f9e3` | `d305f1e4-9b5b-4ab2-b6fe-072836f63fa9` | Ativo |
| **Keity** | `keitysl@tterrasul.com.br` | `3f218cd9-8bd3-4e2d-9582-8bc6f3227356` | `9093883e-7ae9-42af-be3b-3f511d1491c7` | Ativo |
| **Ketren** | `ketrensl@tterrasul.com.br` | `ff3279a4-da2b-4dd8-8aa8-58c38324ea97` | `b2d88631-228b-4164-aba9-48413204bad7` | Ativo |
| **Leonardo** | `leonardobenitessl@tterrasul.com.br` | `792dd4a7-10c9-425b-9398-6aac6a2db332` | `b7616e56-04ee-4c69-a058-824ce4d31e3a` | Ativo |
| **Maite** | `maitesl@tterrasul.com.br` | `64b8f8bc-5534-4d91-8d36-b7f754fda410` | `ec816f02-40e0-4048-a33d-0c1fe189ad1e` | Ativo |
| **Rafael** | `caixasl@tterrasul.com.br` | `1beafeb2-a5ca-47c3-a7fa-8e662c7ba8f9` | `257754df-3377-4293-b9d3-063ef74c83a9` | Ativo |
| **Sergio** | `sergiosl@tterrasul.com.br` | `266e96db-25ee-49cb-b5a5-c57a877c885e` | `9e25abc9-b27e-4f7f-b081-73de81edd503` | Ativo |
| **Vanessa** | `vanessa.tterrasulsantana@gmail.com` | `da944410-2be1-48f1-badc-e510db04179a` | `31ecfa1a-62de-43cb-8a90-f76008a0c38b` | Ativo |
| **Vinicios** | `viniciossl@tterrasul.com.br` | `62b75063-6aff-40f3-bf13-aaa55b186946` | `eaebcdf7-f356-4085-8c5f-501a3509c5f3` | Ativo |
| **Ygor** | `ygor@tterrasul.com.br` | `e9517bfc-5fe5-47dc-b905-f936a1bf7b94` | `07f5b6fb-9bf9-4406-ac44-c84dfc92bda3` | Ativo |

---

## 2. UUIDs dos Atendentes nas Sessões Reais (`userId` do protocolo)

Estes são os UUIDs que vêm preenchidos no campo `userId` dentro do histórico de conversas da FLW:

| Atendente | UUID de Sessão na FLW (`userId`) | Sessões (Últimos 7 dias) |
| :--- | :--- | :---: |
| **Fernando** | `03e5b0e7-cdf1-4f16-9911-1cc4c67b909c` | 2.241 |
| **Vinicios** | `3fc97bda-e48a-485f-b47a-7cf2305c57c5` | 180 |
| **Sergio** | `9c5c6f2e-fe1d-427d-b495-4aaad98a83fa` | 160 |
| **Agendamento** | `e82b616a-82f3-4f79-bd88-21671a353527` | 146 |
| **Keity** | `770c7fd0-72cf-470b-b0ee-17adaebf8d0f` | 38 |
| **Henrique** | `88b9e4e0-86df-4c0b-8787-aa7e49d4cfac` | 33 |
| **Jorge** | `a002dea7-2bf6-4ebc-aafb-5527cb623a5e` | 22 |
| **Leonardo** | `45b30523-911b-4f06-830c-5f22823a5792` | 20 |
| **Ketren** | `c136900f-6387-4e76-82ed-c99f76e7feb1` | 1 |
| **Ygor** | `d0b6183d-c19a-4cc9-b8bc-dae9fcba6658` | 1 |
| **Junior** | `d0927624-d5e9-4ad1-8779-1f036ca145be` | 1 |
