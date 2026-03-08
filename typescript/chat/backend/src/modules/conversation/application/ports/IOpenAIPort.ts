export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface IOpenAIPort {
  streamCompletion(messages: ChatMessage[]): AsyncGenerator<string>;
}
