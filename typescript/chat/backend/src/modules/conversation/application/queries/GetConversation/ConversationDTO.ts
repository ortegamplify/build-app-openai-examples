export interface MessageDTO {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
}

export interface ConversationDTO {
  id: string;
  title: string;
  messages: MessageDTO[];
  createdAt: Date;
  updatedAt: Date;
}
