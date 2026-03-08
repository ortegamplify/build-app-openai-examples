import { injectable } from 'tsyringe';
import OpenAI from 'openai';
import { IOpenAIPort, ChatMessage } from '../../application/ports/IOpenAIPort';

@injectable()
export class OpenAIAdapter implements IOpenAIPort {
  private readonly client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async *streamCompletion(messages: ChatMessage[]): AsyncGenerator<string> {
    const stream = await this.client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4',
      messages: messages as any,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) yield delta;
    }
  }
}
