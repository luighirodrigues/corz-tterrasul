/**
 * Tipos TypeScript para a API FLW Chat (chat, core, crm)
 * Baseados nas especificações OpenAPI documentadas no IA-GUIA.
 */

export interface FlwPagination<T> {
  pageNumber: number;
  pageSize: number;
  totalItems?: number;
  totalCount?: number;
  totalPages?: number;
  hasMorePages: boolean;
  items: T[];
  data?: T[];
}

export interface FlwAgentDetails {
  id: string;
  name: string;
  email?: string;
}

export interface FlwDepartmentDetails {
  id: string;
  name: string;
}

export interface FlwContactDetails {
  id?: string;
  name?: string;
  nameWhatsapp?: string;
  phonenumber?: string;
  pictureUrl?: string;
  email?: string;
}

export interface FlwClassification {
  categoryId?: string;
  categoryName?: string;
  subcategoryId?: string;
  subcategoryName?: string;
}

export interface FlwSessionDTO {
  id: string;
  number?: number;
  title?: string;
  status: string; // IN_PROGRESS, COMPLETED, WAITING, CANCELED, etc.
  contactId?: string;
  contactDetails?: FlwContactDetails;
  channelId?: string;
  channelType?: string;
  userId?: string;
  agentDetails?: FlwAgentDetails;
  departmentId?: string;
  departmentDetails?: FlwDepartmentDetails;
  startAt?: string;
  firstResponseAt?: string;
  endAt?: string;
  lastInteractionDate?: string;
  lastMessageIn?: string;
  lastMessageOut?: string;
  type?: string;
  timeWait?: number;
  timeService?: number;
  createdAt?: string;
  updatedAt?: string;
  classification?: FlwClassification;
}

export interface FlwMessageFileDetails {
  publicUrl?: string;
  fileName?: string;
  fileSize?: number;
}

export interface FlwMessageTranscription {
  text?: string;
  status?: string;
  processing?: boolean;
}

export interface FlwMessageDetails {
  file?: FlwMessageFileDetails;
  transcription?: FlwMessageTranscription;
}

export interface FlwMessageDTO {
  id: string;
  sessionId: string;
  type: string; // TEXT, AUDIO, IMAGE, NOTE, TRACK, TRANSITION, etc.
  direction: "FROM_HUB" | "TO_HUB" | string;
  origin: "BOT" | "DEFAULT" | "API" | string;
  status?: string;
  text?: string;
  timestamp?: string;
  createdAt?: string;
  userId?: string;
  senderId?: string;
  details?: FlwMessageDetails;
}

export interface FlwAgentDTO {
  id: string;
  name: string;
  email?: string;
  role?: string;
  active?: boolean;
}

export interface FlwDepartmentDTO {
  id: string;
  name: string;
}

export interface FlwPanelDTO {
  id: string;
  title: string;
}

export interface FlwPanelCardDTO {
  id: string;
  title?: string;
  panelId: string;
  stepId?: string;
  stepTitle?: string;
  stepPhase?: string;
  panelTitle?: string;
  status: "OPEN" | "WON" | "LOST" | string;
  lostReason?: { id?: string; name?: string } | string | null;
  responsibleUserId?: string;
  sessionId?: string;
  createdAt?: string;
  updatedAt?: string;
}
