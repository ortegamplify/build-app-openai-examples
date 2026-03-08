import { UniqueId } from './UniqueId';

export abstract class Entity {
  protected id: UniqueId;

  constructor(id?: UniqueId) {
    this.id = id || new UniqueId();
  }

  public getId(): UniqueId {
    return this.id;
  }

  public equals(other: Entity): boolean {
    if (!other) return false;
    if (this.constructor !== other.constructor) return false;
    return this.id.equals(other.id);
  }
}
