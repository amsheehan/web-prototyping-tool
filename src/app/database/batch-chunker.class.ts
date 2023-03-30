import { inject } from '@angular/core';
import { FIRESTORE_BATCH_LIMIT } from 'cd-common/consts';
import {
  writeBatch,
  Firestore,
  WriteBatch,
  UpdateData,
  DocumentReference,
  DocumentData,
} from '@angular/fire/firestore';

export class BatchChunker {
  public id = Symbol(); // Unique identifier
  private firestore: Firestore = inject(Firestore);
  private batches: WriteBatch[] = [];
  private count = 0;

  constructor() {}

  get currentBatch() {
    this.checkWriteCount();
    const { batches } = this;
    const activeBatch = batches[batches.length - 1];
    return activeBatch;
  }

  public set(documentRef: DocumentReference, data: DocumentData) {
    this.currentBatch.set(documentRef, data);
  }

  public update(documentRef: DocumentReference<any>, data: UpdateData<any>) {
    this.currentBatch.update(documentRef, data);
  }

  public delete(documentRef: DocumentReference) {
    this.currentBatch.delete(documentRef);
  }

  public async commit(): Promise<void> {
    for (const batch of this.batches) {
      await batch.commit();
    }
  }

  private checkWriteCount() {
    if (this.count % FIRESTORE_BATCH_LIMIT === 0) {
      if (this.firestore) {
        const batch = writeBatch(this.firestore);
        this.batches.push(batch);
      }
    }
    // Must be called 2nd
    this.count++;
  }
}
