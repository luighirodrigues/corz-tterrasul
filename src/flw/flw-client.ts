import { env } from "../config/env.js";
import type {
  FlwAgentDTO,
  FlwDepartmentDTO,
  FlwMessageDTO,
  FlwPagination,
  FlwPanelCardDTO,
  FlwPanelDTO,
  FlwSessionDTO,
} from "./flw-types.js";

export interface FlwClientOptions {
  token?: string;
  chatUrl?: string;
  coreUrl?: string;
  crmUrl?: string;
  requestsPerMinute?: number;
}

export interface ListPanelCardsParams {
  panelId: string;
  pageNumber?: number;
  pageSize?: number;
  statuses?: string[];
  createdAtAfter?: string;
  createdAtBefore?: string;
}

export class FlwClient {
  private token: string;
  private chatUrl: string;
  private coreUrl: string;
  private crmUrl: string;
  private minIntervalMs: number;
  private lastRequestTime = 0;

  constructor(options: FlwClientOptions = {}) {
    this.token = options.token || env.FLW_TOKEN;
    this.chatUrl = options.chatUrl || env.FLW_CHAT_URL;
    this.coreUrl = options.coreUrl || env.FLW_CORE_URL;
    this.crmUrl = options.crmUrl || env.FLW_CRM_URL;

    const rpm = options.requestsPerMinute || env.FLW_RATE_LIMIT_PER_MINUTE || 60;
    this.minIntervalMs = Math.ceil(60000 / rpm);
  }

  private async rateLimitWait(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minIntervalMs) {
      await new Promise((resolve) => setTimeout(resolve, this.minIntervalMs - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  private async request<T>(url: string, options: RequestInit = {}, retries = 3): Promise<T> {
    await this.rateLimitWait();

    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${this.token}`,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ...(options.headers as Record<string, string>),
    };

    if (options.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, { ...options, headers });

        if (response.status === 429) {
          const retryAfter = response.headers.get("retry-after");
          const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.pow(2, attempt) * 1000;
          console.warn(`[FlwClient] Rate limit 429 atingido. Aguardando ${waitMs}ms... (Tentativa ${attempt}/${retries})`);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }

        if (response.status >= 500 && attempt < retries) {
          const waitMs = Math.pow(2, attempt) * 1000;
          console.warn(`[FlwClient] Erro no servidor ${response.status}. Aguardando ${waitMs}ms para retry...`);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }

        const text = await response.text().catch(() => "");

        if (!response.ok) {
          throw new Error(`FLW API error: ${response.status} ${response.statusText} at ${url} - ${text}`);
        }

        try {
          return JSON.parse(text) as T;
        } catch {
          throw new Error(`FLW API returned non-JSON (${response.status} ${response.statusText} at ${url}): ${text.slice(0, 300)}`);
        }
      } catch (error: any) {
        if (attempt >= retries) {
          throw error;
        }
        console.warn(`[FlwClient] Falha de requisição: ${error.message}. Retry em ${attempt * 1000}ms...`);
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }

    throw new Error(`Falha ao concluir requisição para ${url} após ${retries} tentativas.`);
  }

  // ==========================================================
  // Sessões e Mensagens (Chat API)
  // ==========================================================

  async listSessions(params: {
    pageNumber?: number;
    pageSize?: number;
    status?: string;
    createdAtAfter?: string;
    createdAtBefore?: string;
    updatedAtAfter?: string;
  } = {}): Promise<FlwPagination<FlwSessionDTO>> {
    const url = new URL(`${this.chatUrl}/v2/session`);
    url.searchParams.set("PageNumber", String(params.pageNumber || 1));
    url.searchParams.set("PageSize", String(params.pageSize || 100));

    if (params.status) url.searchParams.set("Status", params.status);
    if (params.createdAtAfter) url.searchParams.set("CreatedAt.After", params.createdAtAfter);
    if (params.createdAtBefore) url.searchParams.set("CreatedAt.Before", params.createdAtBefore);
    if (params.updatedAtAfter) url.searchParams.set("UpdatedAt.After", params.updatedAtAfter);

    // Na API FLW (ASP.NET), arrays na query string devem ser repetidos
    const defaultDetails = ["AgentDetails", "DepartmentsDetails", "ClassificationDetails", "ContactDetails"];
    for (const d of defaultDetails) {
      url.searchParams.append("IncludeDetails", d);
    }

    return this.request<FlwPagination<FlwSessionDTO>>(url.toString());
  }

  async getSession(id: string): Promise<FlwSessionDTO> {
    const url = new URL(`${this.chatUrl}/v2/session/${id}`);
    const defaultDetails = ["AgentDetails", "DepartmentsDetails", "ClassificationDetails", "ContactDetails"];
    for (const d of defaultDetails) {
      url.searchParams.append("IncludeDetails", d);
    }
    return this.request<FlwSessionDTO>(url.toString());
  }

  async listSessionMessages(
    sessionId: string,
    pageNumber = 1,
    pageSize = 100
  ): Promise<FlwPagination<FlwMessageDTO>> {
    const url = new URL(`${this.chatUrl}/v1/session/${sessionId}/message`);
    url.searchParams.set("PageNumber", String(pageNumber));
    url.searchParams.set("PageSize", String(pageSize));
    return this.request<FlwPagination<FlwMessageDTO>>(url.toString());
  }

  async listAllSessionMessages(sessionId: string): Promise<FlwMessageDTO[]> {
    const allMessages: FlwMessageDTO[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.listSessionMessages(sessionId, page, 100);
      const msgs = response.items || response.data || [];
      if (msgs.length > 0) {
        allMessages.push(...msgs);
      }
      hasMore = response.hasMorePages && msgs.length > 0;
      page++;
    }

    return allMessages;
  }

  // ==========================================================
  // Agentes e Departamentos (Core API)
  // ==========================================================

  async listAgents(): Promise<FlwAgentDTO[]> {
    const url = `${this.coreUrl}/v1/agent`;
    const response = await this.request<{ items?: FlwAgentDTO[]; data?: FlwAgentDTO[] } | FlwAgentDTO[]>(url);
    if (Array.isArray(response)) return response;
    return response.items || response.data || [];
  }

  async listDepartments(): Promise<FlwDepartmentDTO[]> {
    const url = `${this.coreUrl}/v2/department`;
    const response = await this.request<{ items?: FlwDepartmentDTO[]; data?: FlwDepartmentDTO[] } | FlwDepartmentDTO[]>(url);
    if (Array.isArray(response)) return response;
    return response.items || response.data || [];
  }

  // ==========================================================
  // Painéis e Cards (CRM API)
  // ==========================================================

  async listPanels(): Promise<FlwPanelDTO[]> {
    const url = `${this.crmUrl}/v2/panel`;
    const response = await this.request<{ items?: FlwPanelDTO[]; data?: FlwPanelDTO[] } | FlwPanelDTO[]>(url);
    if (Array.isArray(response)) return response;
    return response.items || response.data || [];
  }

  async listPanelCards(
    paramsOrPanelId: string | ListPanelCardsParams,
    pageNumber = 1,
    pageSize = 100,
    options?: {
      statuses?: string[];
      createdAtAfter?: string;
      createdAtBefore?: string;
    }
  ): Promise<FlwPagination<FlwPanelCardDTO>> {
    let params: ListPanelCardsParams;
    if (typeof paramsOrPanelId === "string") {
      params = {
        panelId: paramsOrPanelId,
        pageNumber,
        pageSize,
        statuses: options?.statuses,
        createdAtAfter: options?.createdAtAfter,
        createdAtBefore: options?.createdAtBefore,
      };
    } else {
      params = paramsOrPanelId;
    }

    const url = new URL(`${this.crmUrl}/v2/panel/card`);
    url.searchParams.set("PanelId", params.panelId);
    url.searchParams.set("PageNumber", String(params.pageNumber || 1));
    url.searchParams.set("PageSize", String(params.pageSize || 100));

    // Por padrão na FLW, se Statuses não for informado, a API filtra somente OPEN.
    // Para trazer todos os cards (OPEN, WON, LOST), passamos explicitamente cada status.
    const activeStatuses =
      params.statuses && params.statuses.length > 0 ? params.statuses : ["OPEN", "WON", "LOST"];
    for (const s of activeStatuses) {
      url.searchParams.append("Statuses", s);
    }

    if (params.createdAtAfter) {
      url.searchParams.set("CreatedAt.After", params.createdAtAfter);
    }
    if (params.createdAtBefore) {
      url.searchParams.set("CreatedAt.Before", params.createdAtBefore);
    }

    url.searchParams.append("IncludeDetails", "StepTitle");
    url.searchParams.append("IncludeDetails", "ResponsibleUser");
    url.searchParams.append("IncludeDetails", "Contacts");
    return this.request<FlwPagination<FlwPanelCardDTO>>(url.toString());
  }

  async listAllPanelCards(
    panelId: string,
    options?: {
      statuses?: string[];
      createdAtAfter?: string;
      createdAtBefore?: string;
    }
  ): Promise<FlwPanelCardDTO[]> {
    const allCards: FlwPanelCardDTO[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.listPanelCards({
        panelId,
        pageNumber: page,
        pageSize: 100,
        statuses: options?.statuses,
        createdAtAfter: options?.createdAtAfter,
        createdAtBefore: options?.createdAtBefore,
      });
      const cards = response.items || response.data || [];
      if (cards.length > 0) {
        allCards.push(...cards);
      }
      hasMore = Boolean(response.hasMorePages && cards.length > 0);
      page++;
    }

    return allCards;
  }
}

