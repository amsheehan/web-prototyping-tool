import * as cd from 'cd-interfaces';
import { Injectable } from '@angular/core';
import { QueryService, IPublishEntryQueryResult } from './query.service';
import { BehaviorSubject } from 'rxjs';
import { mergePublishEntryData } from './query.service.utils';
import { removeValueFromArrayAtIndex } from 'cd-utils/array';
import {
  FirebaseField,
  FirebaseCollection,
  FirebaseOrderBy,
  FirebaseQueryOperation,
} from 'cd-common/consts';
import {
  DocumentData,
  QueryDocumentSnapshot,
  collection,
  collectionData,
  where,
  query,
  orderBy,
  startAfter,
  limit,
} from '@angular/fire/firestore';

@Injectable()
export class ComponentQueryService extends QueryService {
  public publishedComponents$ = new BehaviorSubject<IPublishEntryQueryResult[]>([]);

  reset() {
    super.reset();
    this.publishedComponents$.next([]);
  }

  onRequestComplete = (publishEntryResults: DocumentData[]) => {
    const last = publishEntryResults[publishEntryResults.length - 1];
    this._end = publishEntryResults.length === 0;
    this._latestEntry = last && last.doc;
    const updates = mergePublishEntryData(
      this.publishedComponents$.getValue(),
      publishEntryResults as IPublishEntryQueryResult[]
    );
    this.publishedComponents$.next(updates);
    this.loading = false;
  };

  buildPublishEntryQuery(lastEntry?: QueryDocumentSnapshot<unknown>): any[] {
    console.log('component-query.service.ts ln46: ');

    const lastEntryFn = [];

    if (lastEntry) {
      lastEntryFn.push(startAfter(lastEntry));
    }

    const q = [
      where(FirebaseField.DocumentType, FirebaseQueryOperation.In, [
        cd.PublishType.CodeComponent,
        cd.PublishType.Symbol,
      ]),
      orderBy(FirebaseField.LastUpdatedAt, FirebaseOrderBy.Desc),
      limit(QueryService.BATCH_SIZE),
      ...lastEntryFn,
    ];

    return q;
  }

  loadAllSortedByDateWithLimit() {
    const { loading, _latestEntry, _end } = this;

    if (_end || loading) return;

    const collectionRef = collection(this.firestore, FirebaseCollection.PublishEntries);

    this.loading = true;
    this._requestSubscription.unsubscribe();
    this._requestSubscription = collectionData(
      query(collectionRef, ...this.buildPublishEntryQuery(_latestEntry))
    ).subscribe(this.onRequestComplete);
  }

  removeEntryFromList(id: string) {
    const publishEntries = [...this.publishedComponents$.getValue()];
    const idx = publishEntries.findIndex((entry) => entry.data.id === id);
    if (idx === -1) return;
    const update = removeValueFromArrayAtIndex(idx, publishEntries);
    this.publishedComponents$.next(update);
  }
}
