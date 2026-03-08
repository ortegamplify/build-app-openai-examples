export interface OpenAIPort {
  streamChat(messages: { role: string; content: string }[]): AsyncGenerator<string>
}
