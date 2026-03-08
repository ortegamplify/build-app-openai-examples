export type MessageRole = 'user' | 'assistant'

interface MessagePrimitive {
  role: MessageRole
  content: string
  createdAt: string
}

export class Message {
  private constructor(
    private readonly role: MessageRole,
    private readonly content: string,
    private readonly createdAt: Date
  ) {}

  static create(role: MessageRole, content: string): Message {
    return new Message(role, content, new Date())
  }

  static fromPrimitive(data: MessagePrimitive): Message {
    return new Message(data.role, data.content, new Date(data.createdAt))
  }

  getRole(): MessageRole {
    return this.role
  }

  getContent(): string {
    return this.content
  }

  getCreatedAt(): Date {
    return this.createdAt
  }

  toPrimitive(): MessagePrimitive {
    return {
      role: this.role,
      content: this.content,
      createdAt: this.createdAt.toISOString(),
    }
  }

  equals(other: Message): boolean {
    return (
      this.role === other.role &&
      this.content === other.content &&
      this.createdAt.getTime() === other.createdAt.getTime()
    )
  }
}
