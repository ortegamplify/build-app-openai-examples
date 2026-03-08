import { Message } from './Message'
import { MessageList } from './MessageList'

export class Conversation {
  private constructor(
    private readonly id: string | null,
    private readonly messages: MessageList
  ) {}

  static create(id: string | null, messages: MessageList): Conversation {
    return new Conversation(id, messages)
  }

  static fromPrimitive(data: { id: string; messages: any[] }): Conversation {
    return new Conversation(data.id, MessageList.fromPrimitive(data.messages))
  }

  getId(): string | null {
    return this.id
  }

  getMessages(): MessageList {
    return this.messages
  }

  addMessage(message: Message): Conversation {
    return new Conversation(this.id, this.messages.addMessage(message))
  }

  toPrimitive(): { id: string | null; messages: any[] } {
    return {
      id: this.id,
      messages: this.messages.toPrimitive(),
    }
  }
}
