import { Message } from './Message'

export class MessageList {
  private constructor(private readonly messages: Message[]) {}

  static create(messages: Message[] = []): MessageList {
    return new MessageList([...messages])
  }

  static fromPrimitive(data: any[]): MessageList {
    return new MessageList(data.map(Message.fromPrimitive))
  }

  addMessage(message: Message): MessageList {
    return new MessageList([...this.messages, message])
  }

  getMessages(): Message[] {
    return [...this.messages]
  }

  toPrimitive(): any[] {
    return this.messages.map((m) => m.toPrimitive())
  }

  toOpenAIFormat(): { role: string; content: string }[] {
    return this.messages.map((m) => ({
      role: m.getRole(),
      content: m.getContent(),
    }))
  }
}
