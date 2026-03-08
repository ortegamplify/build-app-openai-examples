import { injectable } from 'tsyringe';
import { ConversationRepository } from '../../../../domain/ConversationRepository';
import { ConversationList } from '../../../../domain/ConversationList';
import { Conversation } from '../../../../domain/Conversation';
import { ConversationModel } from '../models/ConversationModel';

@injectable()
export class MongoConversationRepository implements ConversationRepository {
  async createConversation(conversation: Conversation): Promise<Conversation> {
    const primitive = conversation.toPrimitive() as any;
    await ConversationModel.create({
      _id: primitive.id,
      title: primitive.title,
      messages: primitive.messages,
      createdAt: primitive.createdAt,
      updatedAt: primitive.updatedAt,
    });
    return conversation;
  }

  async updateConversation(conversation: Conversation): Promise<boolean> {
    const primitive = conversation.toPrimitive() as any;
    const result = await ConversationModel.findByIdAndUpdate(
      primitive.id,
      {
        title: primitive.title,
        messages: primitive.messages,
        updatedAt: primitive.updatedAt,
      },
      { new: true },
    );
    return result !== null;
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const doc = await ConversationModel.findById(id).lean();
    if (!doc) return null;
    return Conversation.fromPrimitive({
      id: doc._id,
      title: doc.title,
      messages: doc.messages,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  }

  async getConversations(): Promise<ConversationList> {
    const docs = await ConversationModel.find().lean();
    const conversations = docs.map((doc) =>
      Conversation.fromPrimitive({
        id: doc._id,
        title: doc.title,
        messages: doc.messages,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      }),
    );
    return ConversationList.create(conversations);
  }

  async deleteConversation(id: string): Promise<boolean> {
    const result = await ConversationModel.findByIdAndDelete(id);
    return result !== null;
  }
}
