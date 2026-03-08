import { injectable } from 'tsyringe';
import { IQuery } from '../../../../shared/application/IQuery';
import { IQueryHandler } from '../../../../shared/application/IQueryHandler';

@injectable()
export class QueryBus {
  private handlers: Map<string, IQueryHandler<any, any>> = new Map();

  register<Q extends IQuery, R>(
    queryName: string,
    handler: IQueryHandler<Q, R>,
  ): void {
    this.handlers.set(queryName, handler);
  }

  async dispatch<Q extends IQuery, R>(query: Q): Promise<R> {
    const queryName = query.constructor.name;
    const handler = this.handlers.get(queryName);

    if (!handler) {
      throw new Error(`No handler registered for query: ${queryName}`);
    }

    return handler.execute(query);
  }
}
