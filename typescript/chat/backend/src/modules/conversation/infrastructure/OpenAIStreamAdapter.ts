import OpenAI from 'openai'
import { OpenAIPort } from '../domain/OpenAIPort'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export class OpenAIStreamAdapter implements OpenAIPort {
  private readonly model: string

  constructor() {
    this.model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
  }

  async *streamChat(messages: { role: string; content: string }[]): AsyncGenerator<string> {
    const stream = await client.chat.completions.create({
      model: this.model,
      messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
      stream: true,
    })

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content
      if (token) yield token
    }
  }
}
