import { IQuery } from '../../../../../shared/application/IQuery';

export class GetConversationQuery implements IQuery {
  readonly name = 'GetConversationQuery';

  constructor(readonly conversationId: string) {}
}
