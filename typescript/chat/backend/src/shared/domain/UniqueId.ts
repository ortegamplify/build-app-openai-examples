import { v4 as uuidv4 } from 'uuid';

export class UniqueId {
  private readonly value: string;

  constructor(value?: string) {
    this.value = value || uuidv4();
  }

  public getValue(): string {
    return this.value;
  }

  public equals(other: UniqueId): boolean {
    if (!other) return false;
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }
}
