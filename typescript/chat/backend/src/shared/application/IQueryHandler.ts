import { IQuery } from './IQuery';

export interface IQueryHandler<Q extends IQuery, R = void> {
  execute(query: Q): Promise<R>;
}
