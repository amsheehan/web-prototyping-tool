/*
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Injectable } from '@angular/core';
import { QueryService, IPublishEntryQueryResult } from './query.service';
import { Subscription, BehaviorSubject } from 'rxjs';
import { mergePublishEntryData } from './query.service.utils';
import {
  FirebaseCollection,
  FirebaseField,
  FirebaseOrderBy,
  FirebaseQueryOperation,
  UNICODE_RANGE_MAX,
} from 'cd-common/consts';
import * as cd from 'cd-interfaces';
import {
  collection,
  collectionData,
  query,
  where,
  orderBy,
  startAfter,
} from '@angular/fire/firestore';

@Injectable()
export class ComponentSearchService extends QueryService {
  private _activeQuery = '';
  private _userRequestSubscription = Subscription.EMPTY;

  public userComponents$ = new BehaviorSubject<IPublishEntryQueryResult[]>([]);
  public otherComponents$ = new BehaviorSubject<IPublishEntryQueryResult[]>([]);
  public userLoading$ = new BehaviorSubject<boolean>(false);

  reset(query = '') {
    super.reset();
    this.userComponents$.next([]);
    this.otherComponents$.next([]);
    this.loading = false;
    this.userLoading$.next(false);
    this._activeQuery = query;
  }

  searchForPublishedComponents(user: cd.IUserIdentity | undefined, query: string) {
    if (!user) return;
    const lowercaseQuery = query.toLowerCase();
    const username = this.usernameFromQuery(lowercaseQuery);
    if (username) return this.searchForPublishedComponentsByUsername(username, user);

    if (this._activeQuery !== lowercaseQuery) {
      this.reset(lowercaseQuery);
      this.searchOwnPublishedComponents(lowercaseQuery, user.id);
    }

    this.searchOthersPublishedComponents(lowercaseQuery, user.id);
  }

  searchForPublishedComponentsByUsername(username: string, currentUser: cd.IUserIdentity) {
    if (this._activeQuery !== username) {
      this.reset(username);
    }
    const { loading, _latestEntry, _end } = this;
    if (_end || loading) return;
    this.loading = true;
    this._requestSubscription.unsubscribe();

    const lastEntryFn: any = [];

    if (_latestEntry) {
      lastEntryFn.push(startAfter(_latestEntry));

      const results$ = collectionData(
        query(
          collection(this.firestore, FirebaseCollection.PublishEntries),
          where(FirebaseField.OwnerEmail, FirebaseQueryOperation.GreaterThanOrEqualTo, username),
          where(
            FirebaseField.OwnerEmail,
            FirebaseQueryOperation.LessThanOrEqualTo,
            username + UNICODE_RANGE_MAX
          ),
          where(FirebaseField.DocumentType, FirebaseQueryOperation.In, [
            cd.PublishType.CodeComponent,
            cd.PublishType.Symbol,
          ]),
          orderBy(FirebaseField.OwnerEmail, FirebaseOrderBy.Asc),
          orderBy(FirebaseField.LastUpdatedAt, FirebaseOrderBy.Desc),
          ...lastEntryFn
        )
      );

      results$.subscribe((data) => {
        if (username === currentUser.email)
          return this.onUserRequestComplete(data as IPublishEntryQueryResult[], '');
        return this.onOthersRequestComplete(data as IPublishEntryQueryResult[], '');
      });
    }
  }

  onUserRequestComplete = (data: IPublishEntryQueryResult[], _query: string) => {
    this.userComponents$.next(data);
    this.userLoading$.next(false);
  };

  searchOwnPublishedComponents(q: string, uid: string) {
    this.userLoading$.next(true);
    this._userRequestSubscription.unsubscribe();
    const request$ = collectionData(
      query(
        collection(this.firestore, FirebaseCollection.PublishEntries),
        where(FirebaseField.DocumentType, FirebaseQueryOperation.In, [
          cd.PublishType.CodeComponent,
          cd.PublishType.Symbol,
        ]),
        where(FirebaseField.Keywords, FirebaseQueryOperation.Contains, q),
        orderBy(FirebaseField.Keywords, FirebaseOrderBy.Asc),
        where(FirebaseField.OwnerId, FirebaseQueryOperation.Equals, uid),
        orderBy(FirebaseField.LastUpdatedAt, FirebaseOrderBy.Desc)
      )
    ).subscribe((data) => this.onUserRequestComplete(data as IPublishEntryQueryResult[], q));

    this._userRequestSubscription.add(request$);
  }

  onOthersRequestComplete = (publishEntryResults: IPublishEntryQueryResult[], uid: string) => {
    const last = publishEntryResults[publishEntryResults.length - 1];
    this._end = publishEntryResults.length === 0;
    this._latestEntry = last && last.doc;
    const filteredData = publishEntryResults.filter((item) => item.data.owner.id !== uid);
    const updates = mergePublishEntryData(this.otherComponents$.getValue(), filteredData);
    this.otherComponents$.next(updates);
    this.loading = false;
  };

  searchOthersPublishedComponents(q: string, uid: string) {
    const { loading, _end } = this;
    if (_end || loading) return;
    this.loading = true;
    this._requestSubscription.unsubscribe();

    const results$ = collectionData(
      query(
        collection(this.firestore, FirebaseCollection.PublishEntries),
        where(FirebaseField.DocumentType, FirebaseQueryOperation.In, [
          cd.PublishType.CodeComponent,
          cd.PublishType.Symbol,
        ]),
        where(FirebaseField.Keywords, FirebaseQueryOperation.Contains, q),
        orderBy(FirebaseField.Keywords, FirebaseOrderBy.Asc),
        where(FirebaseField.OwnerId, FirebaseQueryOperation.Equals, uid),
        orderBy(FirebaseField.LastUpdatedAt, FirebaseOrderBy.Desc)
      )
    ).subscribe((data) => this.onUserRequestComplete(data as IPublishEntryQueryResult[], q));

    this._requestSubscription.add(results$);
  }
}
