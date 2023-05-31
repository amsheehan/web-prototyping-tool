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

import {
  DEFAULT_PROJECT_TYPE,
  FirebaseCollection,
  FirebaseField,
  FirebaseOrderBy,
  FirebaseQueryOperation,
} from 'cd-common/consts';
import { Injectable } from '@angular/core';
import { from, BehaviorSubject, forkJoin, Observable } from 'rxjs';
import {
  QueryService,
  FirestoreDocSnapshot,
  IProjectQueryResult,
} from 'src/app/database/query.service';
import { ScreenshotService } from '../../../../services/screenshot-lookup/screenshot-lookup.service';
import { combineProjectsAndSortByDate, mergeProjects } from 'src/app/database/query.service.utils';
import { DatabaseService } from 'src/app/database/database.service';
import { projectPathForId } from '../../../../database/path.utils';
import { removeValueFromArrayAtIndex } from 'cd-utils/array';
import { filter, finalize, map, tap } from 'rxjs/operators';
import { IAppState, SettingsUpdate } from 'src/app/store';
import {
  limit,
  startAfter,
  where,
  orderBy,
  query,
  doc,
  collection,
  CollectionReference,
  Query,
} from '@angular/fire/firestore';
import type * as cd from 'cd-interfaces';
import { Store } from '@ngrx/store';
import { environment } from 'src/environments/environment';

export enum ProjectQueryState {
  Mine,
  All,
  Starred,
}

@Injectable()
export class ProjectService extends QueryService {
  private _latestEditorEntry?: FirestoreDocSnapshot;
  private _editorEnd = false;
  public queryState = ProjectQueryState.Mine;
  public projects$ = new BehaviorSubject<cd.IProject[]>([]);

  constructor(
    protected _screenshotService: ScreenshotService,
    protected _databaseService: DatabaseService,
    private _appStore: Store<IAppState>
  ) {
    super(_screenshotService, _databaseService);
  }

  reset() {
    super.reset();
    // Editor Query  ////////////////////
    this._editorEnd = false;
    this._latestEditorEntry = undefined;
    ////////////////////////////////////
    this.projects$.next([]);
  }

  setQueryState(state: ProjectQueryState) {
    if (this.queryState === state) return;
    this.queryState = state;
    this.reset();
  }

  buildAllRecentProjectsQuery(
    ref: CollectionReference
    // lastEntry?: FirestoreDocSnapshot
  ) {
    let q = query(
      ref,
      where(FirebaseField.DocumentType, FirebaseQueryOperation.Equals, DEFAULT_PROJECT_TYPE),
      orderBy(FirebaseField.LastUpdatedAt, FirebaseOrderBy.Desc),
      limit(QueryService.BATCH_SIZE)
    );

    return q;
  }

  buildProjectOwnerQuery(
    ref: CollectionReference,
    userId: string,
    lastEntry?: FirestoreDocSnapshot
  ): Query {
    let constraints = [
      where(FirebaseField.OwnerId, FirebaseQueryOperation.Equals, userId),
      where(FirebaseField.DocumentType, FirebaseQueryOperation.Equals, DEFAULT_PROJECT_TYPE),
      orderBy(FirebaseField.LastUpdatedAt, FirebaseOrderBy.Desc),
      limit(QueryService.BATCH_SIZE),
      startAfter(lastEntry),
    ];

    return query(ref, ...constraints);
  }

  buildProjectEditorQuery(
    ref: CollectionReference,
    userId: string,
    userEmail: string,
    lastEntry?: FirestoreDocSnapshot
  ): Query {
    let constraints: any[] = [
      ref,
      where(FirebaseField.Editor, FirebaseQueryOperation.Contains, userEmail),
      where(FirebaseField.OwnerId, FirebaseQueryOperation.NotEqualTo, userId),
      where(FirebaseField.DocumentType, FirebaseQueryOperation.Equals, DEFAULT_PROJECT_TYPE),
      orderBy(FirebaseField.OwnerId, FirebaseOrderBy.Asc),
      orderBy(FirebaseField.LastUpdatedAt, FirebaseOrderBy.Desc),
      limit(QueryService.BATCH_SIZE),
      startAfter(lastEntry),
    ];

    return query(...constraints);
  }

  mapProjectQueryResults = (results: IProjectQueryResult[]): cd.IProject[] => {
    return results.map((r) => r.data);
  };

  /** When a project query completes, log the last entry for pagination */
  tapProjectPagination = (results: IProjectQueryResult[]) => {
    const last = results[results.length - 1];
    this._end = results.length === 0;
    this._latestEntry = last && last.doc;
  };

  /** When an editor query completes, log the last entry for pagination */
  tapEditorPagination = (results: IProjectQueryResult[]) => {
    const last = results[results.length - 1];
    this._editorEnd = results.length === 0;
    this._latestEditorEntry = last && last.doc;
  };

  loadRecentProjectsForAllUsers() {
    if (!environment.databaseEnabled) return;
    const { loading, _latestEntry, _end } = this;
    if (_end || loading) return;
    this.loading = true;
    this._requestSubscription.unsubscribe();
    const colRef = collection(this.firestore, FirebaseCollection.Projects);
    this.getCollection<cd.IProject>(
      FirebaseCollection.Projects,
      this.buildAllRecentProjectsQuery(colRef, _latestEntry)
    )
      .pipe(tap(this.tapProjectPagination), map(this.mapProjectQueryResults))
      .subscribe(this.onRequestComplete);
  }

  private _removeIdsFromStarredProjects(currentStarredProjects: string[], idsToRemove: string[]) {
    const starredProjects = currentStarredProjects.filter((id) => !idsToRemove.includes(id));
    const action = new SettingsUpdate({ starredProjects });
    this._appStore.dispatch(action);
  }

  loadStarredProjects(starred: string[]) {
    if (!environment.databaseEnabled) return;
    const { loading, _end } = this;
    if (_end || loading || !starred.length) return;
    this.loading = true;
    this._requestSubscription.unsubscribe();

    const idsToRemove: string[] = [];
    const reqs$ = starred.map((id) => {
      const path = projectPathForId(id);
      const docRef = doc(this.firestore, path);

      return docRef.get().pipe(
        map((doc: any) => {
          if (!doc.exists) {
            idsToRemove.push(id);
            return;
          }
          return doc.data() as cd.IProject;
        })
      );
    });

    this._requestSubscription = forkJoin(reqs$)
      .pipe(
        filter((project: any) => !!project),
        map((args: any) => combineProjectsAndSortByDate([args as cd.IProject[]])),
        // In the future, we handle pagination for stars manually
        finalize(() => {
          this._end = true;
          if (!idsToRemove.length) return;
          this._removeIdsFromStarredProjects(starred, idsToRemove);
        })
      )
      .subscribe(this.onRequestComplete);
  }

  onRequestComplete = (projects: cd.IProject[]) => {
    this.updateScreenshotsForProjects(projects);
    const updates = mergeProjects(this.projects$.getValue(), projects);
    this.projects$.next(updates);
    this.loading = false;
  };

  loadAllSortedByDateWithLimit(user: cd.IUser | undefined, starred: string[] = []) {
    if (!environment.databaseEnabled) return;
    const { queryState } = this;
    if (queryState === ProjectQueryState.All) return this.loadRecentProjectsForAllUsers();
    if (queryState === ProjectQueryState.Starred) return this.loadStarredProjects(starred);

    const uid = user?.id;
    const email = user?.email;
    const endOfQueries = this._end && this._editorEnd;

    if (!email || !uid || this.loading || endOfQueries) return;

    this.loading = true;

    const colRef = collection(this.firestore, FirebaseCollection.Projects);
    const ownerProjects$ = this.getCollection<cd.IProject>(
      FirebaseCollection.Projects,
      this.buildProjectOwnerQuery(colRef, uid, this._latestEntry)
    ).pipe(tap(this.tapProjectPagination), map(this.mapProjectQueryResults));

    const editorProjects$ = this.getCollection<cd.IProject>(
      FirebaseCollection.Projects,
      this.buildProjectEditorQuery(colRef, uid, email, this._latestEditorEntry)
    ).pipe(tap(this.tapEditorPagination), map(this.mapProjectQueryResults));

    const req: Observable<cd.IProject[]>[] = [];
    if (!this._end) req.push(ownerProjects$);
    if (!this._editorEnd) req.push(editorProjects$);

    this._requestSubscription = forkJoin(req)
      .pipe(map(combineProjectsAndSortByDate))
      .subscribe(this.onRequestComplete);
  }

  removeProjectFromList(projectId: string) {
    const projects = [...this.projects$.getValue()];
    const idx = projects.findIndex((proj) => proj.id === projectId);
    if (idx === -1) return;
    const update = removeValueFromArrayAtIndex(idx, projects);
    this.projects$.next(update);
  }
}
