import { map, first, take, takeUntil, retry, switchMap } from 'rxjs/operators';
import { Subscription, BehaviorSubject, Observable, ReplaySubject, Subject } from 'rxjs';
import { ScreenshotService } from 'src/app/services/screenshot-lookup/screenshot-lookup.service';
import * as cd from 'cd-interfaces';
import { OnDestroy, Injectable, inject } from '@angular/core';
import { stringMatchesRegex } from 'cd-utils/string';
import {
  DEFAULT_PROJECT_TYPE,
  FirebaseField,
  FirebaseQueryOperation,
  TILE_THUMBNAIL_LIMIT,
  UNICODE_RANGE_MAX,
  FirebaseOrderBy,
} from 'cd-common/consts';
import { DatabaseService } from './database.service';
import {
  startAfter,
  orderBy,
  where,
  Query,
  CollectionReference,
  collectionData,
  collection,
  query,
  QueryConstraint,
  QueryDocumentSnapshot,
  Firestore,
} from '@angular/fire/firestore';

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
const OWNER_REGEX = /^owner:/;

export type FirestoreDocSnapshot = QueryDocumentSnapshot<unknown>;

export interface IQueryResult<T extends cd.IBaseDocument> {
  data: T;
  doc: FirestoreDocSnapshot;
}

export type IProjectQueryResult = IQueryResult<cd.IProject>;

export type IPublishEntryQueryResult = IQueryResult<cd.IPublishEntry>;

@Injectable({
  providedIn: 'root',
})
export class QueryService implements OnDestroy {
  static BATCH_SIZE = 36;

  private _loading = false;
  private _loading$ = new Subject<boolean>();
  protected firestore = inject(Firestore);
  protected readonly destroyed = new ReplaySubject<void>(1);
  protected _latestEntry?: FirestoreDocSnapshot;
  protected _subscriptions = new Subscription();
  protected _screenshotSubscription = new Subscription();
  protected _requestSubscription = Subscription.EMPTY;
  protected _end = false;
  public boardThumbnails$ = new BehaviorSubject(new Map<string, cd.IScreenshotRef[]>());

  constructor(
    protected _screenshotService: ScreenshotService,
    protected _databaseService: DatabaseService
  ) {}

  getCollection<T extends cd.IBaseDocument>(
    ref: string,
    queryExpressions?: QueryConstraint[]
  ): Observable<IQueryResult<T>[]> {
    console.log('query.service.ts ln 59', { ref });
    const collectionRef = collection(this.firestore, ref);

    if (queryExpressions) {
      return collectionData(query(collectionRef, ...queryExpressions)).pipe(
        retry(3),
        first(), // Auto unsubscribe
        map((results) =>
          results.reduce<IQueryResult<T>[]>((acc: any, doc) => {
            console.log('query.service.ts ln 75: ', doc, acc);
            const id = doc.id;
            const data = doc.data() as T;
            if (!id) {
              console.error('Missing id for document', id);
              return acc;
            }
            acc.push({ data, doc });
            return acc;
          }, [])
        ),
        takeUntil(this.destroyed)
      );
    }

    return collectionData(collection(this.firestore, ref)).pipe(
      retry(3),
      first(), // Auto unsubscribe
      map((results) =>
        results.reduce<IQueryResult<T>[]>((acc: any, doc) => {
          const id = doc.id;
          const data = doc.data() as T;
          if (!id) {
            console.error('Missing id for document', id);
            return acc;
          }
          acc.push({ data, doc });
          return acc;
        }, [])
      ),
      takeUntil(this.destroyed)
    );
  }

  set loading(value: boolean) {
    if (this._loading === value) return;
    this._loading$.next(value);
    this._loading = value;
  }

  get loading() {
    return this._loading;
  }

  get loading$() {
    return this._loading$;
  }

  reset() {
    this._end = false;
    this._latestEntry = undefined;
    this.loading = false;
  }

  updateScreenshotsForProjects(data: cd.IProject[]) {
    this._screenshotSubscription = new Subscription();

    for (const proj of data) {
      const boards$ = this._databaseService.getProjectBoards(proj, TILE_THUMBNAIL_LIMIT);
      const screenshots$ = boards$.pipe(
        switchMap((boards) => {
          const boardIds = boards.map((b) => b.id);
          return this._screenshotService.getScreenshotUrl(boardIds);
        }),
        take(1),
        takeUntil(this.destroyed)
      );

      this._screenshotSubscription.add(
        screenshots$.subscribe((ref) => {
          const thumbnails = this.boardThumbnails$.getValue();
          thumbnails.set(proj.id, ref);
          this.boardThumbnails$.next(thumbnails);
        })
      );
    }
  }

  buildUsernameSearchQuery(
    ref: CollectionReference,
    queryStr: string,
    lastEntry?: QueryDocumentSnapshot<unknown>,
    types: cd.IProject['type'][] = [DEFAULT_PROJECT_TYPE]
  ): Query {
    console.log('query.service.ts ln 170');

    const lastEntryFn: any = [];

    if (lastEntry) {
      lastEntryFn.push(startAfter(lastEntry));
    }

    return query(
      ref,
      where(FirebaseField.OwnerEmail, FirebaseQueryOperation.GreaterThanOrEqualTo, queryStr),
      where(
        FirebaseField.OwnerEmail,
        FirebaseQueryOperation.LessThanOrEqualTo,
        queryStr + UNICODE_RANGE_MAX
      ),
      where(FirebaseField.DocumentType, FirebaseQueryOperation.In, types),
      orderBy(FirebaseField.OwnerEmail, FirebaseOrderBy.Asc),
      orderBy(FirebaseField.LastUpdatedAt, FirebaseOrderBy.Desc),
      ...lastEntryFn
    );
  }

  usernameFromQuery = (query: string): string | undefined => {
    const isOwner = !query.includes(FirebaseField.Owner) && stringMatchesRegex(query, EMAIL_REGEX);
    const value = isOwner ? `${FirebaseField.Owner}:${query}` : query;
    return value.split(OWNER_REGEX)[1];
  };

  ngOnDestroy(): void {
    this.destroyed.next();
    this.destroyed.complete();
    this._requestSubscription.unsubscribe();
  }
}
