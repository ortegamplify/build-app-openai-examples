import mongoose, { Schema, Document, Model } from 'mongoose'
import { Conversation } from '../domain/Conversation'
import { ConversationRepository } from '../domain/ConversationRepository'

interface ConversationDocument extends Document {
  _id: mongoose.Types.ObjectId
  messages: { role: string; content: string; createdAt: string }[]
}

const messageSchema = new Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    createdAt: { type: String, required: true },
  },
  { _id: false }
)

const conversationSchema = new Schema<ConversationDocument>(
  { messages: [messageSchema] },
  { timestamps: true }
)

let ConversationModel: Model<ConversationDocument>

function getModel(): Model<ConversationDocument> {
  if (!ConversationModel) {
    ConversationModel = mongoose.model<ConversationDocument>('Conversation', conversationSchema)
  }
  return ConversationModel
}

export class MongoConversationRepository implements ConversationRepository {
  async save(conversation: Conversation): Promise<Conversation> {
    const model = getModel()
    const primitive = conversation.toPrimitive()

    if (primitive.id === null) {
      const doc = await model.create({ messages: primitive.messages })
      return Conversation.fromPrimitive({
        id: doc._id.toString(),
        messages: primitive.messages,
      })
    }

    await model.findByIdAndUpdate(
      primitive.id,
      { messages: primitive.messages },
      { new: true }
    )
    return conversation
  }

  async findById(id: string): Promise<Conversation | null> {
    const model = getModel()
    const doc = await model.findById(id).lean()
    if (!doc) return null

    return Conversation.fromPrimitive({
      id: (doc._id as mongoose.Types.ObjectId).toString(),
      messages: (doc.messages ?? []) as any[],
    })
  }

  async findAll(): Promise<Conversation[]> {
    const model = getModel()
    const docs = await model.find().lean()
    return docs.map((doc) =>
      Conversation.fromPrimitive({
        id: (doc._id as mongoose.Types.ObjectId).toString(),
        messages: (doc.messages ?? []) as any[],
      })
    )
  }

  async delete(id: string): Promise<boolean> {
    const model = getModel()
    const result = await model.findByIdAndDelete(id)
    return result !== null
  }
}
